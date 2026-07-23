import { useEffect, useState, useCallback } from "react";
import { log } from "../../lib/logger";
import { isDesktopRuntime } from "../../lib/runtime";
import { resolveMediaSrc } from "../../lib/media";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../ui/Icon";
import {
  getAllProjects,
  deleteProject,
  updateProject,
  type ProjectRecord,
} from "../../services/database";
import { buildClipSegmentsFromSilence } from "../../lib/editor";
import {
  migrateLegacyProject,
  validateTimelineProject,
} from "../../lib/editor/timeline";
import { useProjectStore } from "../../stores/projectStore";
import { getVideoMetadata, detectSilence } from "../../services/tauriCommands";
import { formatTime, formatFileSize } from "../../lib/utils";
import type {
  AppView,
  ClipSegment,
  DetectionResult,
  DetectionSettings,
  PreviewMode,
  VideoMetadata,
} from "../../types";

const defaultDetectionSettings: DetectionSettings = {
  noiseThreshold: -30,
  minDuration: 0.5,
  mode: "cut",
  speedMultiplier: 2.0,
  fadeEnabled: true,
  detectBreath: false,
  playbackRate: 1.0,
};

function parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function isValidVideoMetadata(value: unknown): value is VideoMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<VideoMetadata>;
  return [metadata.duration, metadata.width, metadata.height, metadata.fps, metadata.file_size]
    .every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)
    && typeof metadata.codec === "string"
    && typeof metadata.has_audio === "boolean";
}

export function MediaLibrary() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    setFilePath,
    setVideoMetadata,
    setDetectionResult,
    setView,
    setProgress,
    setProcessedFilePath,
    setPreviewFilePath,
    loadProject,
    detectionSettings,
  } = useProjectStore();

  const loadProjects = useCallback(async () => {
    try {
      const data = await getAllProjects();
      setProjects(data);
    } catch (err) {
      log.warn("[db]", "Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) {
      setLoading(false);
      return;
    }
    loadProjects();
  }, [loadProjects]);

  const handleOpenProject = useCallback(
    async (project: ProjectRecord) => {
      try {
        setView("processing");
        setProgress({
          percent: 10,
          stage: "metadata",
          message: t("mediaLibrary.loadingProject"),
        });

        // Check if project has saved editing state
        const savedClips = parseJsonSafe<ClipSegment[]>(project.clip_segments, []);
        const savedSilenceSegments = parseJsonSafe<DetectionResult["segments"]>(
          project.silence_segments,
          []
        );
        const savedDetectionResult = parseJsonSafe<DetectionResult | null>(
          project.detection_result_json,
          null
        );
        const parsedTimelineProject = parseJsonSafe<unknown>(
          project.timeline_json,
          null
        );
        const savedTimelineProject = validateTimelineProject(parsedTimelineProject)
          ? parsedTimelineProject
          : null;
        // Merge with defaults so new fields (e.g. playbackRate) get a value
        const savedSettings: DetectionSettings = {
          ...defaultDetectionSettings,
          ...parseJsonSafe<Partial<DetectionSettings>>(
            project.detection_settings_json,
            {}
          ),
        };
        const savedView = (project.current_view || "import") as AppView;
        const savedPreviewMode = (project.preview_mode || "source") as PreviewMode;
        const parsedMetadata = parseJsonSafe<unknown>(
          project.video_metadata_json,
          null
        );
        const savedMetadata = isValidVideoMetadata(parsedMetadata)
          ? parsedMetadata
          : null;

        // Use saved metadata or re-read (fast ffprobe call).
        let metadata = savedMetadata;
        if (!metadata) {
          metadata = await getVideoMetadata(project.file_path);
        }

        const legacyClipSegments = savedClips.length > 0
          ? savedClips
          : buildClipSegmentsFromSilence(savedSilenceSegments, metadata.duration);
        const migratedTimelineProject = savedTimelineProject ?? migrateLegacyProject({
          asset: {
            path: project.file_path,
            name: project.name,
            metadata,
            thumbnailPath: project.thumbnail_path,
            sourceFingerprint: `${metadata.file_size}:${metadata.duration}:${metadata.codec}`,
          },
          clipSegments: legacyClipSegments,
        });
        const hasSavedState = savedTimelineProject !== null || legacyClipSegments.length > 0 || savedDetectionResult !== null || savedSilenceSegments.length > 0;

        if (hasSavedState || project.current_view !== "import") {
          setProgress({
            percent: 50,
            stage: "restoring",
            message: t("mediaLibrary.restoringProject"),
          });
          const removedSegments = savedDetectionResult?.segments ?? savedSilenceSegments;

          loadProject({
            projectId: project.id,
            filePath: project.file_path,
            videoMetadata: metadata,
            detectionResult: savedDetectionResult,
            detectionSettings: savedSettings,
            clipSegments: legacyClipSegments,
            removedSegments,
            timelineProject: migratedTimelineProject,
            currentView: "processing",
            previewMode: savedPreviewMode,
            processedPath: project.processed_path,
          });

          if (!savedTimelineProject) {
            try {
              await updateProject(project.id, {
                timeline_json: JSON.stringify(migratedTimelineProject),
                project_schema_version: migratedTimelineProject.schemaVersion,
                status: "in_progress",
              });
            } catch (migrationError) {
              log.warn("[restore]", "Failed to persist migrated timeline:", migrationError);
            }
          }

          setProgress({
            percent: 100,
            stage: "complete",
            message: t("mediaLibrary.projectRestored"),
          });
          log.info(
            "[restore]",
            `Project ${project.id} restored — view:${savedView} clips:${savedClips.length}`
          );
          await new Promise((r) => setTimeout(r, 200));
          setView(savedView === "processing" ? "editor" : savedView);
          return;
        }

        // No saved editing state — load from scratch.
        setProcessedFilePath(project.processed_path);
        setPreviewFilePath(null);
        setFilePath(project.file_path);
        setVideoMetadata(metadata);

        // Has cached silence segments? Use them
        if (savedSilenceSegments.length > 0) {
          const segments = savedSilenceSegments;
          const totalSilence = segments.reduce(
            (acc: number, segment: { duration: number }) => acc + segment.duration,
            0
          );

          const detectionResult: DetectionResult = {
            segments,
            total_silence_duration: totalSilence,
            original_duration: metadata.duration,
            estimated_output_duration: metadata.duration - totalSilence,
          };
          const clips = buildClipSegmentsFromSilence(segments, metadata.duration);

          loadProject({
            projectId: project.id,
            filePath: project.file_path,
            videoMetadata: metadata,
            detectionResult,
            detectionSettings: savedSettings,
            clipSegments: clips,
            removedSegments: segments,
            currentView: "detection",
            previewMode: "source",
            processedPath: project.processed_path,
          });

          setProgress({
            percent: 100,
            stage: "complete",
            message: t("mediaLibrary.loadedCachedSegments", { count: segments.length }),
          });
          return;
        }

        // No cached data — run detection
        setProgress({
          percent: 25,
          stage: "analyzing",
          message: t("mediaLibrary.detectingSilence"),
        });
        const result = await detectSilence(
          project.file_path,
          project.noise_threshold || detectionSettings.noiseThreshold,
          project.min_duration || detectionSettings.minDuration
        );
        setDetectionResult(result);
        useProjectStore.getState().setProjectId(project.id);
        setView("detection");
      } catch (err) {
        log.error("[import]", "Failed to open project:", err);
        setView("import");
      }
    },
    [
      detectionSettings,
      loadProject,
      setDetectionResult,
      setFilePath,
      setProcessedFilePath,
      setPreviewFilePath,
      setProgress,
      setVideoMetadata,
      setView,
      t,
    ]
  );

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((project) => project.id !== id));
    } catch (err) {
      log.error("[db]", "Failed to delete project:", err);
    }
  };

  if (!isDesktopRuntime()) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
          <Icon name="desktop_windows" className="text-outline text-xl" />
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {t("mediaLibrary.desktopOnly")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <Icon
          name="hourglass_empty"
          className="text-on-surface-variant animate-spin"
        />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 space-y-4">
        <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
          <Icon name="cloud_off" className="text-outline text-xl" />
        </div>
        <p className="text-xs text-on-surface-variant">
          {t("mediaLibrary.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 pb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {t("mediaLibrary.recentProjects")}
        </h3>
        <span className="text-[10px] text-on-surface-variant/60">
          {projects.length} {t("mediaLibrary.files")}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1.5">
        {projects.map((project) => {
          const isInProgress = project.status === "in_progress";
          return (
            <div
              key={project.id}
              className="w-full p-3 rounded-lg hover:bg-surface-container-highest transition-all group cursor-pointer"
              onClick={() => void handleOpenProject(project)}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-8 rounded bg-surface-container-lowest flex-shrink-0 overflow-hidden">
                  {project.thumbnail_path ? (
                    <img
                      src={resolveMediaSrc(project.thumbnail_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon
                        name="videocam"
                        className="text-on-surface-variant/40 text-sm"
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-on-surface truncate">
                    {project.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-on-surface-variant">
                      {formatTime(project.duration)}
                    </span>
                    <span className="text-[9px] text-on-surface-variant/40">•</span>
                    <span className="text-[9px] text-on-surface-variant">
                      {formatFileSize(project.file_size)}
                    </span>
                    {isInProgress && (
                      <>
                        <span className="text-[9px] text-on-surface-variant/40">•</span>
                        <span className="text-[9px] text-secondary font-medium">
                          {t("mediaLibrary.inProgress")}
                        </span>
                      </>
                    )}
                    {project.status === "processed" && (
                      <>
                        <span className="text-[9px] text-on-surface-variant/40">•</span>
                        <span className="text-[9px] text-primary font-medium">
                          {t("mediaLibrary.processed")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(project.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-error/20 rounded transition-all"
                >
                  <Icon name="delete" className="text-sm text-error/70" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
