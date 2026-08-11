import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoProject } from "../lib/editor/timeline";
import type { MediaAsset } from "../types";

const updateProject = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../services/database", () => ({
  updateProject,
}));

vi.mock("../lib/runtime", () => ({
  isDesktopRuntime: () => true,
}));

const {
  projectStateMatchesSnapshot,
  saveProjectState,
  snapshotProjectState,
} = await import("./useAutoSave");
const { useProjectStore } = await import("../stores/projectStore");

const asset: Omit<MediaAsset, "id" | "kind"> = {
  path: "/videos/source.mp4",
  name: "source.mp4",
  metadata: {
    duration: 10,
    width: 1280,
    height: 720,
    fps: 30,
    codec: "h264",
    file_size: 100,
    has_audio: true,
  },
  thumbnailPath: null,
  sourceFingerprint: "100:10:h264",
};

describe("project autosave snapshots", () => {
  beforeEach(() => {
    updateProject.mockClear();
    useProjectStore.getState().resetProject();
  });

  it("persists the project snapshot even after the active project changes", async () => {
    const timelineProject = createVideoProject(asset);
    useProjectStore.setState({ projectId: 7, timelineProject });
    const snapshot = useProjectStore.getState();

    useProjectStore.setState({ projectId: 8, timelineProject: createVideoProject(asset) });

    await expect(saveProjectState(7, snapshot)).resolves.toBe(true);
    expect(updateProject).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        timeline_json: JSON.stringify(timelineProject),
        project_schema_version: 3,
      }),
    );
  });

  it("persists source mode when an edited preview path is missing", async () => {
    const timelineProject = createVideoProject(asset);
    useProjectStore.setState({
      projectId: 7,
      timelineProject,
      previewMode: "edited",
      editedPreviewFilePath: null,
    });

    await expect(saveProjectState(7, useProjectStore.getState())).resolves.toBe(true);
    expect(updateProject).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ preview_mode: "source", edited_preview_path: null }),
    );

    useProjectStore.setState({
      previewMode: "edited",
      editedPreviewFilePath: "/previews/current.mp4",
    });
    await expect(saveProjectState(7, useProjectStore.getState())).resolves.toBe(true);
    expect(updateProject).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ preview_mode: "edited", edited_preview_path: "/previews/current.mp4" }),
    );
  });

  it("keeps the saved view when browsing the library instead of persisting \"import\"", async () => {
    const timelineProject = createVideoProject(asset);
    useProjectStore.setState({ projectId: 7, timelineProject, currentView: "editor" });

    await expect(saveProjectState(7, useProjectStore.getState())).resolves.toBe(true);
    expect(updateProject).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ current_view: "editor" }),
    );

    useProjectStore.setState({ currentView: "import" });
    await expect(saveProjectState(7, useProjectStore.getState())).resolves.toBe(true);
    expect(updateProject).toHaveBeenLastCalledWith(
      7,
      expect.not.objectContaining({ current_view: expect.anything() }),
    );
  });

  it("does not save a snapshot with a mismatched project ID", async () => {
    const timelineProject = createVideoProject(asset);
    useProjectStore.setState({ projectId: 7, timelineProject });

    await expect(saveProjectState(8, useProjectStore.getState())).resolves.toBe(false);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("detects project changes that happen while a transition is awaiting I/O", async () => {
    const timelineProject = createVideoProject(asset);
    useProjectStore.setState({
      projectId: 7,
      timelineProject,
      currentView: "editor",
    });
    const snapshot = snapshotProjectState(useProjectStore.getState());
    let releaseTransition!: () => void;
    const transition = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    }).then(() => projectStateMatchesSnapshot(useProjectStore.getState(), snapshot));

    useProjectStore.setState({
      timelineProject: { ...timelineProject, revision: timelineProject.revision + 1 },
    });
    releaseTransition();
    await expect(transition).resolves.toBe(false);

    useProjectStore.setState({ timelineProject });
    expect(projectStateMatchesSnapshot(useProjectStore.getState(), snapshot)).toBe(true);

    useProjectStore.setState({ currentView: "processing" });
    expect(projectStateMatchesSnapshot(useProjectStore.getState(), snapshot)).toBe(false);
  });
});
