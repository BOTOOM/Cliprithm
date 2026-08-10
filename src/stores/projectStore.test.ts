import { beforeEach, describe, expect, it } from "vitest";
import { createVideoProject } from "../lib/editor/timeline";
import { useProjectStore } from "./projectStore";
import type { MediaAsset, VideoMetadata } from "../types";

const metadata: VideoMetadata = {
  duration: 10,
  width: 1280,
  height: 720,
  fps: 30,
  codec: "h264",
  file_size: 100,
  has_audio: true,
};

const asset: Omit<MediaAsset, "id" | "kind"> = {
  path: "/videos/source.mp4",
  name: "source.mp4",
  metadata,
  thumbnailPath: null,
  sourceFingerprint: "100:10:h264",
};

describe("project store loading", () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject();
  });

  it("clears the previous timeline when loading a project without saved timeline state", () => {
    const previousProject = createVideoProject(asset);
    useProjectStore.setState({
      projectId: 7,
      timelineProject: previousProject,
    });

    const state = useProjectStore.getState();
    state.loadProject({
      projectId: 8,
      filePath: "/videos/next.mp4",
      videoMetadata: metadata,
      detectionResult: null,
      detectionSettings: state.detectionSettings,
      clipSegments: [],
      removedSegments: [],
      timelineProject: null,
      currentView: "processing",
      previewMode: "source",
      processedPath: null,
    });

    expect(useProjectStore.getState().projectId).toBe(8);
    expect(useProjectStore.getState().timelineProject).toBeNull();
    expect(useProjectStore.getState().timelineUndoStack).toHaveLength(0);
    expect(useProjectStore.getState().selectedClipId).toBeNull();
  });

  it("rejects a split that would not produce a timeline mutation", () => {
    const timelineProject = createVideoProject(asset);
    const clipId = timelineProject.clips[0].id;
    useProjectStore.setState({ timelineProject });
    useProjectStore.getState().setTimelineClipSpeed(clipId, 0.25);

    const before = useProjectStore.getState().timelineProject;
    const revision = before?.revision;

    expect(useProjectStore.getState().dispatchEditorAction({
      type: "clip.splitAtPlayhead",
      clipId,
      timelineTime: 0.1,
    })).toBe(false);
    expect(useProjectStore.getState().timelineProject).toBe(before);
    expect(useProjectStore.getState().timelineProject?.revision).toBe(revision);
  });

  it("clears project-specific derived state when resetting before a new import", () => {
    useProjectStore.setState({
      projectId: 11,
      detectionResult: {
        segments: [{ start: 1, end: 2, duration: 1 }],
        total_silence_duration: 1,
        original_duration: 10,
        estimated_output_duration: 9,
      },
      clipSegments: [{ id: "old-clip", label: "Old", start: 0, end: 1, duration: 1 }],
      removedSegments: [{ start: 1, end: 2, duration: 1 }],
      editedPreviewFilePath: "/previews/old.mp4",
      editedPreviewPending: true,
      previewMode: "edited",
      editHistory: [{ clipSegments: [], removedSegments: [], selectedClipId: null }],
      canUndo: true,
    });

    useProjectStore.getState().resetProject();
    const state = useProjectStore.getState();
    expect(state.projectId).toBeNull();
    expect(state.detectionResult).toBeNull();
    expect(state.clipSegments).toEqual([]);
    expect(state.removedSegments).toEqual([]);
    expect(state.editedPreviewFilePath).toBeNull();
    expect(state.editedPreviewPending).toBe(false);
    expect(state.previewMode).toBe("source");
    expect(state.editHistory).toEqual([]);
    expect(state.canUndo).toBe(false);
  });

  it("clears an edited preview when the timeline revision changes", () => {
    const timelineProject = createVideoProject(asset);
    useProjectStore.setState({
      projectId: 9,
      timelineProject,
      editedPreviewFilePath: "/previews/old.mp4",
      editedPreviewPending: false,
      previewMode: "edited",
    });

    expect(useProjectStore.getState().dispatchEditorAction({
      type: "clip.setSpeed",
      clipId: timelineProject.clips[0].id,
      speed: 2,
    })).toBe(true);
    expect(useProjectStore.getState().editedPreviewFilePath).toBeNull();
    expect(useProjectStore.getState().editedPreviewPending).toBe(false);
    expect(useProjectStore.getState().previewMode).toBe("source");
  });

  it("falls back to source mode when an edited preview fails", () => {
    useProjectStore.setState({
      previewMode: "edited",
      editedPreviewFilePath: null,
      editedPreviewPending: true,
    });

    useProjectStore.getState().setEditedPreviewPending(false);

    expect(useProjectStore.getState().previewMode).toBe("source");
  });

  it("restores source preview mode when an edited artifact is not available", () => {
    const timelineProject = createVideoProject(asset);
    const state = useProjectStore.getState();

    state.loadProject({
      projectId: 10,
      filePath: asset.path,
      videoMetadata: metadata,
      detectionResult: null,
      detectionSettings: state.detectionSettings,
      clipSegments: [],
      removedSegments: [],
      timelineProject,
      currentView: "editor",
      previewMode: "edited",
      processedPath: null,
    });

    expect(useProjectStore.getState().previewMode).toBe("source");
    expect(useProjectStore.getState().editedPreviewFilePath).toBeNull();
  });
});
