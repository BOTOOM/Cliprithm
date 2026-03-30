import { useEffect, useState, useCallback } from "react";
import { Icon } from "../ui/Icon";
import {
  getAllProjects,
  deleteProject,
  type ProjectRecord,
} from "../../services/database";
import { useProjectStore } from "../../stores/projectStore";
import { getVideoMetadata, detectSilence } from "../../services/tauriCommands";
import { formatTime, formatFileSize } from "../../lib/utils";

export function MediaLibrary() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    setFilePath,
    setVideoMetadata,
    setDetectionResult,
    setView,
    setProgress,
    detectionSettings,
  } = useProjectStore();

  const loadProjects = useCallback(async () => {
    try {
      const data = await getAllProjects();
      setProjects(data);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleOpenProject = useCallback(
    async (project: ProjectRecord) => {
      try {
        setFilePath(project.file_path);
        setView("processing");
        setProgress({
          percent: 10,
          stage: "metadata",
          message: "Loading project...",
        });

        const metadata = await getVideoMetadata(project.file_path);
        setVideoMetadata(metadata);

        // If we have cached silence segments, use them
        if (project.silence_segments && project.silence_segments !== "[]") {
          const segments = JSON.parse(project.silence_segments);
          const totalSilence = segments.reduce(
            (acc: number, s: { duration: number }) => acc + s.duration,
            0
          );
          setDetectionResult({
            segments,
            total_silence_duration: totalSilence,
            original_duration: metadata.duration,
            estimated_output_duration: metadata.duration - totalSilence,
          });
          setProgress({
            percent: 100,
            stage: "complete",
            message: `Loaded ${segments.length} cached segments`,
          });
          setTimeout(() => setView("editor"), 800);
        } else {
          // Re-detect
          setProgress({
            percent: 30,
            stage: "analyzing",
            message: "Detecting silence...",
          });
          const result = await detectSilence(
            project.file_path,
            project.noise_threshold || detectionSettings.noiseThreshold,
            project.min_duration || detectionSettings.minDuration
          );
          setDetectionResult(result);
          setProgress({
            percent: 100,
            stage: "complete",
            message: `Found ${result.segments.length} silent segments`,
          });
          setTimeout(() => setView("editor"), 1500);
        }
      } catch (err) {
        console.error("Failed to open project:", err);
        setView("import");
      }
    },
    [
      setFilePath,
      setVideoMetadata,
      setDetectionResult,
      setView,
      setProgress,
      detectionSettings,
    ]
  );

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <Icon name="hourglass_empty" className="text-on-surface-variant animate-spin" />
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
          No media imported yet. Start a new project to see files here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 pb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Recent Projects
        </h3>
        <span className="text-[10px] text-on-surface-variant/60">
          {projects.length} files
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1.5">
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => handleOpenProject(project)}
            className="w-full text-left p-3 rounded-lg hover:bg-surface-container-highest transition-all group"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              <div className="w-12 h-8 rounded bg-surface-container-lowest flex-shrink-0 overflow-hidden">
                {project.thumbnail_path ? (
                  <img
                    src={`asset://localhost/${project.thumbnail_path}`}
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
                  <span className="text-[9px] text-on-surface-variant/40">
                    •
                  </span>
                  <span className="text-[9px] text-on-surface-variant">
                    {formatFileSize(project.file_size)}
                  </span>
                  {project.status === "processed" && (
                    <>
                      <span className="text-[9px] text-on-surface-variant/40">
                        •
                      </span>
                      <span className="text-[9px] text-primary font-medium">
                        Processed
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Delete button */}
              <button
                onClick={(e) => handleDelete(project.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-error/20 rounded transition-all"
              >
                <Icon name="delete" className="text-sm text-error/70" />
              </button>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
