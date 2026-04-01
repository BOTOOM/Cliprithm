import { useEffect, useState, useCallback } from "react";
import { log } from "../../lib/logger";
import { isDesktopRuntime } from "../../lib/runtime";
import { resolveMediaSrc } from "../../lib/media";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../ui/Icon";
import {
  getAllProjects,
  deleteProject,
  type ProjectRecord,
} from "../../services/database";
import { buildClipSegmentsFromSilence } from "../../lib/editor";
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
        const savedDetectionResult = parseJsonSafe<DetectionResult | null>(
          project.detection_result_json,
          null
        );
        const savedSettings = parseJsonSafe<DetectionSettings>(
          project.detection_settings_json,
          defaultDetectionSettings
        );
        const savedView = (project.current_view || "import") as AppView;
        const savedPreviewMode = (project.preview_mode || "source") as PreviewMode;
        const savedMetadata = parseJsonSafe<VideoMetadata | null>(
          project.video_metadata_json,
          null
        );

        // Has a saved in-progress state? Restore it
        const hasSavedState =
          savedClips.length > 0 &&
          savedDetectionResult !== null &&
          savedView !== "import";

        if (hasSavedState) {
          setProgress({
            percent: 50,
            stage: "restoring",
            message: t("mediaLibrary.restoringProject"),
          });

          // Use saved metadata or re-read (fast ffprobe call)
          let metadata = savedMetadata;
          if (!metadata) {
            metadata = await getVideoMetadata(project.file_path);
          }

          const removedSegments = savedDetectionResult?.segments ?? [];

          // Restore to "processing" first so the UI shows loading
          // then transition to the saved view after a tick
          loadProject({
            projectId: project.id,
            filePath: project.file_path,
            videoMetadata: metadata,
            detectionResult: savedDetectionResult,
            detectionSettings: savedSettings,
            clipSegments: savedClips,
            removedSegments,
            currentView: "processing",
            previewMode: savedPreviewMode,
            processedPath: project.processed_path,
          });

          setProgress({
            percent: 100,
            stage: "complete",
            message: t("mediaLibrary.projectRestored"),
          });

          log.info(
            "[restore]",
            `Project ${project.id} restored — view:${savedView} clips:${savedClips.length}`
          );

          // Transition to the saved view after a short delay so the
          // video element has time to mount and start loading
          await new Promise((r) => setTimeout(r, 200));
          setView(savedView);
          return;
        }

        // No saved editing state — load from scratch
        setProcessedFilePath(project.processed_path);
        setPreviewFilePath(null);
        setFilePath(project.file_path);

        const metadata = await getVideoMetadata(project.file_path);
        setVideoMetadata(metadata);

        // Has cached silence segments? Use them
        if (project.silence_segments && project.silence_segments !== "[]") {
          const segments = JSON.parse(project.silence_segments);
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
