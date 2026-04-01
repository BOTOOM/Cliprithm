import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/projectStore";
import { updateProject } from "../services/database";
import { log } from "../lib/logger";
import { isDesktopRuntime } from "../lib/runtime";

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
        state.detectionSettings !== prevState.detectionSettings ||
        state.videoMetadata !== prevState.videoMetadata;

      if (!changed) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void saveProjectState(id, state);
      }, 1500);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

async function saveProjectState(
  id: number,
  state: ReturnType<typeof useProjectStore.getState>
) {
  try {
    const hasEdits =
      state.clipSegments.length > 0 || state.detectionResult !== null;
    const status = hasEdits ? "in_progress" : "imported";

    await updateProject(id, {
      clip_segments: JSON.stringify(state.clipSegments),
      current_view: state.currentView,
      preview_mode: state.previewMode,
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
      status,
    });
    log.debug("[auto-save]", `Project ${id} saved (${status})`);
  } catch (err) {
    log.warn("[auto-save]", "Failed to save project state:", err);
  }
}
