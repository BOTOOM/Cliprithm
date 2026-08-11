import { describe, expect, it } from "vitest";
import {
  activeProjectStateMatches,
  canAcceptMcpJobStatuses,
  clearMcpPreviewJobIfOwned,
  enqueueProjectLifecycle,
  handleTool,
  isMcpPreviewJobCurrent,
  MAX_MCP_JOBS,
  isMcpOutputPathAllowed,
  MCP_TOOL_CATALOG,
  normalizeOverwriteConfirmationArgs,
  parseSilenceDetectionRequest,
  snapshotActiveProjectState,
  startMcpRenderJob,
  validateMcpToolArguments,
} from "./mcpBridge";
import { statusFromResponse } from "../stores/mcpStore";
import { useProjectStore } from "../stores/projectStore";
import { createProject, deleteProject, getProjectById, updateProject } from "./database";
import { createVideoProject } from "../lib/editor/timeline";
import { createSemanticRange } from "../lib/editor/semanticRanges";
import type { MediaAsset, SilenceDetectionCandidate } from "../types";

function tool(name: string) {
  const definition = MCP_TOOL_CATALOG.find((candidate) => candidate.name === `cliprithm_${name}`);
  if (!definition) throw new Error(`Missing MCP tool: ${name}`);
  return definition;
}

const previewAsset: Omit<MediaAsset, "id" | "kind"> = {
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

describe("MCP tool contract", () => {
  it("rejects a second render reservation for the same project", async () => {
    const createJob = (jobId: string) => ({
      jobId,
      projectId: 987654,
      projectRevision: 1,
      kind: "export_render" as const,
      status: "queued" as const,
      percent: 0,
      outputPath: null,
      error: null,
      outputExistedBefore: false,
      cleanupOutput: false,
    });

    expect(startMcpRenderJob(createJob("mcp-test-first"), async () => "/tmp/first.mp4")).toEqual({ ok: true });
    expect(startMcpRenderJob(createJob("mcp-test-second"), async () => "/tmp/second.mp4")).toMatchObject({
      ok: false,
      errorCode: "JOB_CONFLICT",
    });
    await Promise.resolve();
  });

  it("returns to source mode when an owned MCP preview job fails", async () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({
      projectId: 988,
      timelineProject,
      previewMode: "source",
      editedPreviewFilePath: null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
    });
    const job = {
      jobId: "mcp-test-failed-preview",
      projectId: 988,
      projectRevision: timelineProject.revision,
      kind: "sequence_preview" as const,
      status: "queued" as const,
      percent: 0,
      outputPath: null,
      error: null,
      outputExistedBefore: false,
      cleanupOutput: false,
    };

    expect(startMcpRenderJob(job, async () => {
      throw new Error("preview failed");
    })).toEqual({ ok: true });
    useProjectStore.getState().setPreviewMode("edited");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useProjectStore.getState()).toMatchObject({
      previewMode: "source",
      editedPreviewFilePath: null,
      editedPreviewJobId: null,
    });
    useProjectStore.getState().resetProject();
  });

  it("returns to source mode when an owned MCP preview job is cancelled", async () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({
      projectId: 989,
      timelineProject,
      previewMode: "source",
      editedPreviewFilePath: null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
    });
    let rejectRender!: (error: Error) => void;
    const render = new Promise<string>((_, reject) => {
      rejectRender = reject;
    });
    const job = {
      jobId: "mcp-test-cancelled-preview",
      projectId: 989,
      projectRevision: timelineProject.revision,
      kind: "sequence_preview" as const,
      status: "queued" as const,
      percent: 0,
      outputPath: null,
      error: null,
      outputExistedBefore: false,
      cleanupOutput: false,
    };

    expect(startMcpRenderJob(job, () => render)).toEqual({ ok: true });
    useProjectStore.getState().setPreviewMode("edited");
    clearMcpPreviewJobIfOwned({ ...job, status: "cancelled" });

    expect(useProjectStore.getState()).toMatchObject({
      previewMode: "source",
      editedPreviewFilePath: null,
      editedPreviewJobId: null,
    });
    rejectRender(new Error("preview cancelled"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    useProjectStore.getState().resetProject();
  });

  it("rejects arguments that violate the advertised input schema", () => {
    expect(validateMcpToolArguments("selection_select_range", {
      projectId: 43,
      start: 2,
      end: 7,
      unexpected: true,
    })).toMatchObject({ valid: false });
    expect(validateMcpToolArguments("selection_select_range", {
      projectId: 43,
      start: "2",
      end: 7,
    })).toMatchObject({ valid: false });
    expect(validateMcpToolArguments("selection_select_range", {
      projectId: 43,
      start: 2,
      end: 7,
    })).toEqual({ valid: true });
  });

  it("publishes the documented selection range tool", () => {
    const definition = tool("selection_select_range");
    expect(definition.inputSchema.required).toEqual(["projectId", "start", "end"]);
    expect(definition.readOnlyHint).toBe(false);
  });

  it("validates nested semantic range schemas before dispatch", () => {
    expect(validateMcpToolArguments("semantic_range_create", {
      projectId: 43,
      expectedRevision: 1,
      title: "A range",
      description: "A description",
      timelineStart: 1,
      timelineEnd: 2,
      unexpected: true,
    })).toMatchObject({ valid: false });
    expect(validateMcpToolArguments("semantic_range_update", {
      projectId: 43,
      expectedRevision: 1,
      rangeId: "range-1",
      updates: { timelineStart: "1" },
    })).toMatchObject({ valid: false });
    expect(validateMcpToolArguments("semantic_range_create", {
      projectId: 43,
      expectedRevision: 1,
      title: "A range",
      description: "A description",
      timelineStart: 1,
      timelineEnd: 2,
    })).toEqual({ valid: true });
  });

  it("serializes project lifecycle operations", async () => {
    let releaseFirst!: () => void;
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const events: string[] = [];
    const first = enqueueProjectLifecycle(async () => {
      events.push("first:start");
      await firstRelease;
      events.push("first:end");
      return "first";
    });
    const second = enqueueProjectLifecycle(async () => {
      events.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("only treats preview jobs from the current revision as pending", () => {
    expect(isMcpPreviewJobCurrent({
      kind: "sequence_preview",
      projectRevision: 4,
      status: "running",
    }, 4)).toBe(true);
    expect(isMcpPreviewJobCurrent({
      kind: "sequence_preview",
      projectRevision: 3,
      status: "running",
    }, 4)).toBe(false);
    expect(isMcpPreviewJobCurrent({
      kind: "export_render",
      projectRevision: 4,
      status: "running",
    }, 4)).toBe(false);
  });

  it("dispatches selection ranges through the editor store", async () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({ projectId: 43, timelineProject, selectedRange: null });

    await expect(handleTool("cliprithm_selection_select_range", {
      projectId: 43,
      start: 2,
      end: 7,
    })).resolves.toMatchObject({
      ok: true,
      actionId: "selection.selectRange",
      data: { start: 2, end: 7 },
    });
    expect(useProjectStore.getState().selectedRange).toEqual({ start: 2, end: 7 });

    await expect(handleTool("cliprithm_selection_select_range", {
      projectId: 43,
      start: 3,
      end: 4,
      unexpected: true,
    })).resolves.toMatchObject({
      ok: false,
      errorCode: "INVALID_INPUT",
    });
    expect(useProjectStore.getState().selectedRange).toEqual({ start: 2, end: 7 });

    useProjectStore.setState({ projectId: null, timelineProject: null, selectedRange: null });
  });

  it("requires the current revision for timeline history mutations", () => {
    for (const name of ["history_undo", "history_redo"]) {
      const definition = tool(name);
      expect(definition.inputSchema.required).toContain("projectId");
      expect(definition.inputSchema.required).toContain("expectedRevision");
      expect(definition.inputSchema.properties.expectedRevision).toMatchObject({ type: "integer" });
    }
  });

  it("rejects empty semantic range updates without changing history", async () => {
    const project = createVideoProject(previewAsset);
    const range = createSemanticRange({
      title: "A range",
      description: "A valid source annotation.",
      sourceAnchors: [{ assetId: project.assets[0].id, sourceStart: 1, sourceEnd: 2 }],
      createdBy: "user",
    });
    const annotated = { ...project, semanticRanges: [range] };
    useProjectStore.setState({
      projectId: 44,
      timelineProject: annotated,
      timelineUndoStack: [],
      timelineRedoStack: [],
      canUndoTimeline: false,
    });

    await expect(handleTool("cliprithm_semantic_range_update", {
      projectId: 44,
      expectedRevision: annotated.revision,
      rangeId: range.id,
      updates: {},
    })).resolves.toMatchObject({
      ok: false,
      errorCode: "ACTION_PRECONDITION_FAILED",
    });
    expect(useProjectStore.getState().timelineProject?.revision).toBe(annotated.revision);
    expect(useProjectStore.getState().timelineUndoStack).toHaveLength(0);

    useProjectStore.getState().resetProject();
  });

  it("returns a structured error when saving a project that is not active", async () => {
    useProjectStore.getState().resetProject();

    await expect(handleTool("cliprithm_project_save", { projectId: 43 })).resolves.toMatchObject({
      ok: false,
      errorCode: "PROJECT_NOT_ACTIVE",
      retryable: false,
    });
  });

  it("requires confirmation before reopening an active project with unsaved changes", async () => {
    const timelineProject = createVideoProject(previewAsset);
    const projectId = await createProject({
      name: "source.mp4",
      file_path: previewAsset.path,
      thumbnail_path: null,
      duration: previewAsset.metadata?.duration ?? 0,
      width: previewAsset.metadata?.width ?? 1280,
      height: previewAsset.metadata?.height ?? 720,
      fps: previewAsset.metadata?.fps ?? 30,
      codec: previewAsset.metadata?.codec ?? "h264",
      file_size: previewAsset.metadata?.file_size ?? 100,
      noise_threshold: -30,
      min_duration: 0.5,
      mode: "cut",
    });
    await updateProject(projectId, {
      current_view: "detection",
      video_metadata_json: JSON.stringify(previewAsset.metadata),
      timeline_json: JSON.stringify(timelineProject),
      project_schema_version: timelineProject.schemaVersion,
      status: "in_progress",
    });

    try {
      useProjectStore.setState({
        projectId,
        timelineProject: { ...timelineProject, revision: timelineProject.revision + 1 },
      });
      const first = await handleTool("cliprithm_project_open", { projectId });
      expect(first).toMatchObject({ ok: false, errorCode: "CONFIRMATION_REQUIRED" });
      const confirmationToken = first && "confirmationToken" in first ? first.confirmationToken : null;
      expect(typeof confirmationToken).toBe("string");

      await expect(handleTool("cliprithm_project_open", {
        projectId,
        confirmationToken,
      })).resolves.toMatchObject({ ok: true, actionId: "project.open" });
      expect(useProjectStore.getState().currentView).toBe("detection");
    } finally {
      useProjectStore.getState().resetProject();
    }
  });

  it("restores legacy clips and resumes the editor when opening through MCP", async () => {
    const projectId = await createProject({
      name: "legacy-source.mp4",
      file_path: previewAsset.path,
      thumbnail_path: null,
      duration: previewAsset.metadata?.duration ?? 0,
      width: previewAsset.metadata?.width ?? 1280,
      height: previewAsset.metadata?.height ?? 720,
      fps: previewAsset.metadata?.fps ?? 30,
      codec: previewAsset.metadata?.codec ?? "h264",
      file_size: previewAsset.metadata?.file_size ?? 100,
      noise_threshold: -30,
      min_duration: 0.5,
      mode: "cut",
    });
    await updateProject(projectId, {
      current_view: "processing",
      silence_segments: JSON.stringify([{ start: 2, end: 4, duration: 2 }]),
      video_metadata_json: JSON.stringify(previewAsset.metadata),
      timeline_json: null,
      project_schema_version: 0,
      status: "in_progress",
    });

    try {
      useProjectStore.getState().resetProject();
      await expect(handleTool("cliprithm_project_open", { projectId })).resolves.toMatchObject({
        ok: true,
        actionId: "project.open",
      });

      const state = useProjectStore.getState();
      expect(state.currentView).toBe("editor");
      expect(state.clipSegments).toHaveLength(2);
      expect(state.timelineProject?.clips).toHaveLength(2);
    } finally {
      useProjectStore.getState().resetProject();
      await deleteProject(projectId);
    }
  });

  it("binds silence candidate mutations to the candidate ID", async () => {
    const timelineProject = createVideoProject(previewAsset);
    const candidate: SilenceDetectionCandidate = {
      id: "candidate-current",
      projectRevision: timelineProject.revision,
      scope: "clip",
      settings: { noiseThreshold: -30, minDuration: 0.5, detectBreath: false },
      ranges: [{
        clipId: timelineProject.clips[0].id,
        segments: [{ start: 1, end: 2, duration: 1 }],
      }],
      estimatedOutputDuration: 9,
      status: "reviewable",
    };
    useProjectStore.setState({
      projectId: 46,
      timelineProject,
      silenceCandidate: candidate,
      timelineUndoStack: [],
      timelineRedoStack: [],
      canUndoTimeline: false,
    });

    try {
      expect(validateMcpToolArguments("silence_apply_candidate", {
        projectId: 46,
        expectedRevision: timelineProject.revision,
      })).toMatchObject({ valid: false });
      expect(validateMcpToolArguments("silence_discard_candidate", {
        projectId: 46,
      })).toMatchObject({ valid: false });

      await expect(handleTool("cliprithm_silence_apply_candidate", {
        projectId: 46,
        expectedRevision: timelineProject.revision,
        candidateId: "candidate-stale",
      })).resolves.toMatchObject({ ok: false, errorCode: "CANDIDATE_STALE" });
      expect(useProjectStore.getState().timelineProject?.revision).toBe(timelineProject.revision);

      await expect(handleTool("cliprithm_silence_discard_candidate", {
        projectId: 46,
        candidateId: "candidate-stale",
      })).resolves.toMatchObject({ ok: false, errorCode: "CANDIDATE_STALE" });
      expect(useProjectStore.getState().silenceCandidate?.id).toBe(candidate.id);

      await expect(handleTool("cliprithm_silence_apply_candidate", {
        projectId: 46,
        expectedRevision: timelineProject.revision,
        candidateId: candidate.id,
      })).resolves.toMatchObject({ ok: true, actionId: "analysis.acceptCandidate" });
      expect(useProjectStore.getState().timelineProject?.revision).toBeGreaterThan(timelineProject.revision);
    } finally {
      useProjectStore.getState().resetProject();
    }
  });

  it("marks candidate detection and discard as state-changing tools", () => {
    expect(tool("silence_detect").readOnlyHint).toBe(false);
    expect(tool("silence_discard_candidate").readOnlyHint).toBe(false);
  });

  it("preserves server errors in the UI status", () => {
    expect(statusFromResponse({ running: true, url: "http://127.0.0.1:47831/mcp", token: "mcp-token", error: null })).toEqual({
      status: "running",
      url: "http://127.0.0.1:47831/mcp",
      token: "mcp-token",
      error: null,
    });
    expect(statusFromResponse({ running: false, url: null, token: null, error: "accept failed" })).toEqual({
      status: "error",
      url: null,
      token: null,
      error: "accept failed",
    });
    expect(statusFromResponse({ running: false, url: null, token: null, error: null })).toEqual({
      status: "stopped",
      url: null,
      token: null,
      error: null,
    });
  });

  it("detects persisted state changes even when the timeline revision is unchanged", () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({
      projectId: 45,
      timelineProject,
      currentView: "editor",
      previewMode: "source",
    });
    const initialState = useProjectStore.getState();
    const snapshot = snapshotActiveProjectState(initialState);

    const changedState = {
      ...initialState,
      detectionSettings: {
        ...initialState.detectionSettings,
        minDuration: initialState.detectionSettings.minDuration + 0.1,
      },
    };
    expect(activeProjectStateMatches(initialState, snapshot)).toBe(true);
    expect(activeProjectStateMatches(changedState, snapshot)).toBe(false);

    useProjectStore.getState().resetProject();
  });

  it("does not evict active MCP jobs when the tracking limit is reached", () => {
    expect(canAcceptMcpJobStatuses(Array.from({ length: MAX_MCP_JOBS }, () => "running" as const))).toBe(false);
    expect(canAcceptMcpJobStatuses([
      ...Array.from({ length: MAX_MCP_JOBS - 1 }, () => "running" as const),
      "complete" as const,
    ])).toBe(true);
    expect(canAcceptMcpJobStatuses(Array.from({ length: MAX_MCP_JOBS - 1 }, () => "running" as const))).toBe(true);
  });

  it("rejects invalid or missing project IDs before destructive confirmation", async () => {
    await expect(handleTool("cliprithm_project_delete", { projectId: 1.5 })).resolves.toMatchObject({
      ok: false,
      errorCode: "INVALID_INPUT",
    });
    await expect(handleTool("cliprithm_project_delete", { projectId: 999_999 })).resolves.toMatchObject({
      ok: false,
      errorCode: "PROJECT_NOT_FOUND",
    });
  });

  it("accepts only output paths below the dedicated MCP directory", () => {
    const root = "/home/user/.local/share/cliprithm/mcp-outputs";
    expect(isMcpOutputPathAllowed(root, `${root}/render.mp4`)).toBe(true);
    expect(isMcpOutputPathAllowed(root, `${root}/nested/render.mp4`)).toBe(true);
    expect(isMcpOutputPathAllowed(root, "/home/user/.local/share/cliprithm/secrets.mp4")).toBe(false);
    expect(isMcpOutputPathAllowed(root, "/home/user/.local/share/cliprithm/mcp-outputs-evil/render.mp4")).toBe(false);
    expect(isMcpOutputPathAllowed(root, "/tmp/render.mp4")).toBe(false);
  });

  it("normalizes overwrite confirmations so the returned token can be reused verbatim", () => {
    expect(normalizeOverwriteConfirmationArgs({
      projectId: 7,
      expectedRevision: 4,
      outputPath: "/tmp/render.mp4",
      confirmationToken: "token",
    })).toEqual({
      projectId: 7,
      expectedRevision: 4,
      outputPath: "/tmp/render.mp4",
      confirmationToken: "token",
      overwrite: true,
    });
  });

  it("allows selecting an edited preview while it is pending", async () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({
      projectId: 41,
      timelineProject,
      editedPreviewFilePath: null,
      editedPreviewPending: true,
    });

    await expect(handleTool("cliprithm_preview_use_edited", { projectId: 41 })).resolves.toMatchObject({
      ok: true,
      actionId: "preview.useEdited",
    });

    useProjectStore.setState({
      projectId: null,
      timelineProject: null,
      editedPreviewFilePath: null,
      editedPreviewPending: false,
      previewMode: "source",
    });
  });

  it("rejects edited preview selection without an available or pending preview", async () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({
      projectId: 42,
      timelineProject,
      editedPreviewFilePath: null,
      editedPreviewPending: false,
    });

    await expect(handleTool("cliprithm_preview_use_edited", { projectId: 42 })).resolves.toMatchObject({
      ok: false,
      errorCode: "PREVIEW_NOT_AVAILABLE",
    });

    useProjectStore.setState({ projectId: null, timelineProject: null });
  });

  it("persists preview mode changes before MCP success responses", async () => {
    const timelineProject = createVideoProject(previewAsset);
    const projectId = await createProject({
      name: "preview-mode-project",
      file_path: previewAsset.path,
      thumbnail_path: null,
      duration: previewAsset.metadata?.duration ?? 0,
      width: previewAsset.metadata?.width ?? 1280,
      height: previewAsset.metadata?.height ?? 720,
      fps: previewAsset.metadata?.fps ?? 30,
      codec: previewAsset.metadata?.codec ?? "h264",
      file_size: previewAsset.metadata?.file_size ?? 100,
      noise_threshold: -30,
      min_duration: 0.5,
      mode: "cut",
    });
    await updateProject(projectId, {
      current_view: "editor",
      video_metadata_json: JSON.stringify(previewAsset.metadata),
      timeline_json: JSON.stringify(timelineProject),
      project_schema_version: timelineProject.schemaVersion,
      status: "in_progress",
    });

    try {
      useProjectStore.setState({
        projectId,
        timelineProject,
        previewMode: "edited",
        editedPreviewFilePath: "/previews/current.mp4",
      });

      await expect(handleTool("cliprithm_preview_use_source", { projectId })).resolves.toMatchObject({
        ok: true,
        actionId: "preview.useSource",
      });
      expect((await getProjectById(projectId))?.preview_mode).toBe("source");

      await expect(handleTool("cliprithm_preview_use_edited", { projectId })).resolves.toMatchObject({
        ok: true,
        actionId: "preview.useEdited",
      });
      expect((await getProjectById(projectId))?.preview_mode).toBe("edited");
      expect((await getProjectById(projectId))?.edited_preview_path).toBe("/previews/current.mp4");
    } finally {
      useProjectStore.getState().resetProject();
      await deleteProject(projectId);
    }
  });

  it("rejects invalid silence detection scope and clip arguments", () => {
    const clipIds = new Set(["clip-1"]);
    expect(parseSilenceDetectionRequest({ scope: "invalid" }, "clip-1", clipIds)).toEqual({
      error: "scope must be either clip or timeline.",
    });
    expect(parseSilenceDetectionRequest({ scope: "clip", clipId: 1 }, "clip-1", clipIds)).toEqual({
      error: "clipId must be a non-empty string when provided.",
    });
    expect(parseSilenceDetectionRequest({ scope: "clip", clipId: "missing" }, "clip-1", clipIds)).toEqual({
      error: "No eligible clip is selected for silence detection.",
    });
    expect(parseSilenceDetectionRequest({ scope: "timeline", clipId: "clip-1" }, "clip-1", clipIds)).toEqual({
      error: "clipId may only be provided when scope is clip.",
    });
    expect(parseSilenceDetectionRequest({}, "clip-1", clipIds)).toEqual({
      scope: "clip",
      clipId: "clip-1",
    });
  });

  it("keeps timeline revisions monotonic across divergent undo branches", async () => {
    const timelineProject = createVideoProject(previewAsset);
    useProjectStore.setState({
      projectId: 44,
      timelineProject,
      timelineUndoStack: [],
      timelineRedoStack: [],
      canUndoTimeline: false,
    });

    const initialRevision = timelineProject.revision;
    expect(useProjectStore.getState().dispatchEditorAction({
      type: "clip.setSpeed",
      clipId: timelineProject.clips[0].id,
      speed: 2,
    })).toBe(true);
    const firstEditRevision = useProjectStore.getState().timelineProject?.revision;
    expect(firstEditRevision).toBe(initialRevision + 1);

    expect(useProjectStore.getState().dispatchEditorAction({ type: "history.undo" })).toBe(true);
    const undoRevision = useProjectStore.getState().timelineProject?.revision;
    expect(undoRevision).toBe(firstEditRevision! + 1);

    expect(useProjectStore.getState().dispatchEditorAction({
      type: "clip.setSpeed",
      clipId: timelineProject.clips[0].id,
      speed: 3,
    })).toBe(true);
    const branchRevision = useProjectStore.getState().timelineProject?.revision;
    expect(branchRevision).toBe(undoRevision! + 1);

    await expect(handleTool("cliprithm_clip_set_speed", {
      projectId: 44,
      expectedRevision: firstEditRevision,
      clipId: timelineProject.clips[0].id,
      speed: 4,
    })).resolves.toMatchObject({
      ok: false,
      errorCode: "REVISION_CONFLICT",
    });

    useProjectStore.setState({ projectId: null, timelineProject: null });
  });
});
