import { describe, expect, it } from "vitest";
import { createVideoProject } from "./timeline";
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
});
