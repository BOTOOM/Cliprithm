import { describe, expect, it } from "vitest";
import { createVideoProject, MAX_PROJECT_CLIPS, setClipSpeed } from "./timeline";
import { createSemanticRange } from "./semanticRanges";
import { validateEditorAction } from "./actions";
import type { MediaAsset } from "../../types";

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

describe("editor action validation", () => {
  it("accepts valid project actions and rejects actions without a project", () => {
    const project = createVideoProject(asset);
    const clipId = project.clips[0].id;
    const context = {
      timelineProject: project,
      canUndoTimeline: false,
      canRedoTimeline: false,
    };

    expect(
      validateEditorAction(
        { type: "selection.selectClip", clipId },
        context
      )
    ).toBe(true);
    expect(
      validateEditorAction(
        { type: "selection.selectClip", clipId: "missing" },
        context
      )
    ).toBe(false);
    expect(
      validateEditorAction(
        { type: "selection.setPlayhead", timelineTime: 5 },
        context
      )
    ).toBe(true);
    expect(
      validateEditorAction(
        { type: "selection.setPlayhead", timelineTime: 11 },
        context
      )
    ).toBe(false);
    expect(validateEditorAction(
      { type: "selection.selectRange", start: 2, end: 7 },
      context,
    )).toBe(true);
    expect(validateEditorAction(
      { type: "selection.selectRange", start: 7, end: 2 },
      context,
    )).toBe(false);
    expect(validateEditorAction(
      { type: "selection.selectRange", start: 2, end: 11 },
      context,
    )).toBe(false);
    expect(
      validateEditorAction(
        { type: "clip.setSpeed", clipId, speed: 2 },
        context
      )
    ).toBe(true);
    expect(
      validateEditorAction(
        { type: "clip.setSpeed", clipId, speed: 0.1 },
        context
      )
    ).toBe(false);
    expect(
      validateEditorAction(
        { type: "clip.trim", clipId, sourceStart: 8, sourceEnd: 2 },
        context
      )
    ).toBe(false);
    expect(
      validateEditorAction(
        {
          type: "asset.addVideo",
          asset: { ...asset, kind: "audio" },
        },
        context
      )
    ).toBe(false);
    expect(
      validateEditorAction(
        {
          type: "asset.addVideo",
          asset,
        },
        context
      )
    ).toBe(true);
    expect(
      validateEditorAction(
        {
          type: "analysis.acceptCandidate",
          projectRevision: project.revision - 1,
          candidates: [{ clipId, segments: [{ start: 1, end: 2, duration: 1 }] }],
        },
        context
      )
    ).toBe(false);

    expect(
      validateEditorAction(
        {
          type: "analysis.acceptCandidate",
          projectRevision: project.revision,
          candidates: [{ clipId, segments: [{ start: 1, end: 2, duration: 1 }] }],
        },
        context
      )
    ).toBe(true);
    expect(
      validateEditorAction(
        { type: "clip.delete", clipId },
        { ...context, timelineProject: null }
      )
    ).toBe(false);
  });

  it("rejects splits that fail the source-duration precondition at slow speed", () => {
    const project = createVideoProject(asset);
    const clipId = project.clips[0].id;
    const slowed = setClipSpeed(project, clipId, 0.25);

    expect(validateEditorAction({
      type: "clip.splitAtPlayhead",
      clipId,
      timelineTime: 0.1,
    }, {
      timelineProject: slowed,
      canUndoTimeline: false,
      canRedoTimeline: false,
    })).toBe(false);
  });

  it("rejects semantic range updates that target protected fields", () => {
    const project = createVideoProject(asset);
    const range = createSemanticRange({
      title: "A range",
      description: "A valid source annotation.",
      tags: [],
      sourceAnchors: [{ assetId: project.assets[0].id, sourceStart: 1, sourceEnd: 2 }],
      createdBy: "user",
    });
    const annotated = { ...project, semanticRanges: [range] };
    const actionContext = {
      timelineProject: annotated,
      canUndoTimeline: false,
      canRedoTimeline: false,
    };
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: { id: "changed" } as never,
    }, actionContext)).toBe(false);
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: {},
    }, actionContext)).toBe(false);
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: { title: "Updated" },
    }, actionContext)).toBe(true);
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: { title: 42 } as never,
    }, actionContext)).toBe(false);
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: { description: null } as never,
    }, actionContext)).toBe(false);
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: { tags: "not-an-array" } as never,
    }, actionContext)).toBe(false);
    expect(validateEditorAction({
      type: "semanticRange.update",
      rangeId: range.id,
      updates: { sourceAnchors: {} } as never,
    }, actionContext)).toBe(false);
  });

  it("rejects silence candidates outside their target clip", () => {
    const project = createVideoProject(asset);
    const clipId = project.clips[0].id;
    const context = {
      timelineProject: project,
      canUndoTimeline: false,
      canRedoTimeline: false,
    };

    expect(validateEditorAction({
      type: "analysis.acceptCandidate",
      projectRevision: project.revision,
      candidates: [{ clipId, segments: [{ start: -1, end: 1, duration: 2 }] }],
    }, context)).toBe(false);
    expect(validateEditorAction({
      type: "analysis.acceptCandidate",
      projectRevision: project.revision,
      candidates: [{ clipId, segments: [{ start: 9, end: 11, duration: 2 }] }],
    }, context)).toBe(false);
    expect(validateEditorAction({
      type: "analysis.acceptCandidate",
      projectRevision: project.revision,
      candidates: [{ clipId, segments: [{ start: 1, end: 2, duration: 2 }] }],
    }, context)).toBe(false);
    expect(validateEditorAction({
      type: "analysis.acceptCandidate",
      projectRevision: project.revision,
      candidates: [{ clipId, segments: [{ start: 0, end: 10, duration: 10 }] }],
    }, context)).toBe(false);
  });

  it("rejects candidates that would exceed the clip limit", () => {
    const project = createVideoProject(asset);
    const clip = project.clips[0];
    const clips = Array.from({ length: MAX_PROJECT_CLIPS }, (_, index) => ({
      ...clip,
      id: `clip-${index}`,
    }));
    const fullProject = {
      ...project,
      clips,
      tracks: project.tracks.map((track) => ({ ...track, clipIds: clips.map((candidate) => candidate.id) })),
    };
    expect(validateEditorAction({
      type: "analysis.acceptCandidate",
      projectRevision: fullProject.revision,
      candidates: [{ clipId: clips[0].id, segments: [{ start: 1, end: 2, duration: 1 }] }],
    }, {
      timelineProject: fullProject,
      canUndoTimeline: false,
      canRedoTimeline: false,
    })).toBe(false);
  });

  it("rejects duplicate clip entries in silence candidates", () => {
    const project = createVideoProject(asset);
    const clipId = project.clips[0].id;
    const context = {
      timelineProject: project,
      canUndoTimeline: false,
      canRedoTimeline: false,
    };
    const candidate = { clipId, segments: [{ start: 1, end: 2, duration: 1 }] };

    expect(validateEditorAction({
      type: "analysis.acceptCandidate",
      projectRevision: project.revision,
      candidates: [candidate, candidate],
    }, context)).toBe(false);
  });
});
