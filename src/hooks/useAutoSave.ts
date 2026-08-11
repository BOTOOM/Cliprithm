import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/projectStore";
import { updateProject } from "../services/database";
import { log } from "../lib/logger";
import { isDesktopRuntime } from "../lib/runtime";
import { persistedPreviewMode } from "../lib/editor/preview";

type ProjectStoreState = ReturnType<typeof useProjectStore.getState>;

export interface ProjectStateSnapshot {
  projectId: number | null;
  clipSegmentsJson: string;
  currentView: string;
  previewMode: string;
  editedPreviewPath: string | null;
  detectionResultJson: string | null;
  detectionSettingsJson: string;
  videoMetadataJson: string | null;
  timelineJson: string | null;
}

export function snapshotProjectState(state: ProjectStoreState): ProjectStateSnapshot {
  return {
    projectId: state.projectId,
    clipSegmentsJson: JSON.stringify(state.clipSegments),
    currentView: state.currentView,
    previewMode: persistedPreviewMode(state.previewMode, state.editedPreviewFilePath),
    editedPreviewPath: state.editedPreviewFilePath,
    detectionResultJson: state.detectionResult ? JSON.stringify(state.detectionResult) : null,
    detectionSettingsJson: JSON.stringify(state.detectionSettings),
    videoMetadataJson: state.videoMetadata ? JSON.stringify(state.videoMetadata) : null,
    timelineJson: state.timelineProject ? JSON.stringify(state.timelineProject) : null,
  };
}

export function projectStateMatchesSnapshot(
  state: ProjectStoreState,
  snapshot: ProjectStateSnapshot,
): boolean {
  return JSON.stringify(snapshotProjectState(state)) === JSON.stringify(snapshot);
}

export function useAutoSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDesktopRuntime()) return;

    const unsubscribe = useProjectStore.subscribe((state, prevState) => {
      const id = state.projectId;
      if (!id) return;

      const changed =
        state.clipSegments !== prevState.clipSegments ||
        state.currentView !== prevState.currentView ||
        state.detectionResult !== prevState.detectionResult ||
        state.previewMode !== prevState.previewMode ||
        state.editedPreviewFilePath !== prevState.editedPreviewFilePath ||
        state.detectionSettings !== prevState.detectionSettings ||
        state.videoMetadata !== prevState.videoMetadata ||
        state.timelineProject !== prevState.timelineProject;

      if (!changed) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      const snapshot = state;
      timerRef.current = setTimeout(() => {
        void saveProjectState(id, snapshot);
      }, 1500);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

export async function saveProjectState(
  id: number,
  state: ReturnType<typeof useProjectStore.getState>,
): Promise<boolean> {
  try {
    if (state.projectId !== id) return false;

    const hasEdits =
      state.clipSegments.length > 0 ||
      state.detectionResult !== null ||
      state.timelineProject !== null;
    const status = hasEdits ? "in_progress" : "imported";

    await updateProject(id, {
      clip_segments: JSON.stringify(state.clipSegments),
      current_view: state.currentView,
      preview_mode: persistedPreviewMode(state.previewMode, state.editedPreviewFilePath),
      edited_preview_path: state.editedPreviewFilePath,
      silence_segments: JSON.stringify(
        state.detectionResult?.segments ?? []
      ),
      detection_result_json: state.detectionResult
        ? JSON.stringify(state.detectionResult)
        : null,
      detection_settings_json: JSON.stringify(state.detectionSettings),
      video_metadata_json: state.videoMetadata
        ? JSON.stringify(state.videoMetadata)
        : null,
      timeline_json: state.timelineProject
        ? JSON.stringify(state.timelineProject)
        : null,
      project_schema_version: state.timelineProject?.schemaVersion ?? 0,
      status,
    });
    log.debug("[auto-save]", `Project ${id} saved (${status})`);
    return true;
  } catch (err) {
    log.warn("[auto-save]", "Failed to save project state:", err);
    return false;
  }
}
