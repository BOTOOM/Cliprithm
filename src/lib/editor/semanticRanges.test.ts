import { describe, expect, it } from "vitest";
import type { MediaAsset, SemanticRange } from "../../types";
import {
  createSemanticRange,
  getSemanticRangeContext,
  sourceAnchorsFromTimelineSelection,
  validateSemanticRangeInProject,
} from "./semanticRanges";
import {
  createVideoProject,
  duplicateClip,
  splitClipAtTimelineTime,
  trimClip,
  validateTimelineProject,
} from "./timeline";

const asset: Omit<MediaAsset, "id" | "kind"> = {
  path: "/videos/source.mp4",
  name: "source.mp4",
  metadata: {
    duration: 20,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: "h264",
    file_size: 100,
    has_audio: true,
  },
  thumbnailPath: null,
  sourceFingerprint: "100:20:h264",
};

function rangeFor(project: ReturnType<typeof createVideoProject>): SemanticRange {
  return createSemanticRange({
    title: "Important explanation",
    description: "The speaker explains the key concept.",
    tags: ["key", "explanation", "key"],
    sourceAnchors: [{
      assetId: project.assets[0].id,
      sourceStart: 4,
      sourceEnd: 8,
    }],
    createdBy: "user",
  });
}

describe("semantic ranges", () => {
  it("creates source anchors from a timeline selection across clips", () => {
    const project = splitClipAtTimelineTime(createVideoProject(asset), "missing", 1);
    const clipId = project.clips[0].id;
    const split = splitClipAtTimelineTime(project, clipId, 10);
    const anchors = sourceAnchorsFromTimelineSelection(split, 8, 15);

    expect(anchors).toHaveLength(2);
    expect(anchors.map((anchor) => [anchor.sourceStart, anchor.sourceEnd])).toEqual([
      [8, 10],
      [10, 15],
    ]);
  });

  it("maps a source range to current timeline occurrences", () => {
    const project = createVideoProject(asset);
    const range = rangeFor(project);
    const context = getSemanticRangeContext(project, range);

    expect(context.presence).toBe("fully_present");
    expect(context.occurrences).toHaveLength(1);
    expect(context.occurrences[0]).toMatchObject({
      sourceStart: 4,
      sourceEnd: 8,
      timelineStart: 4,
      timelineEnd: 8,
      coverage: 1,
    });
    expect(range.tags).toEqual(["key", "explanation"]);
  });

  it("keeps source knowledge and reports partial presence after trim", () => {
    const project = createVideoProject(asset);
    const range = rangeFor(project);
    const trimmed = trimClip(project, project.clips[0].id, 0, 6);
    const context = getSemanticRangeContext(trimmed, range);

    expect(context.presence).toBe("partially_present");
    expect(context.occurrences).toHaveLength(1);
    expect(context.occurrences[0].sourceEnd).toBe(6);
    expect(range.sourceAnchors[0].sourceEnd).toBe(8);
  });

  it("returns multiple occurrences when source content is duplicated", () => {
    const project = createVideoProject(asset);
    const duplicate = duplicateClip(project, project.clips[0].id);
    const range = rangeFor(duplicate);
    const context = getSemanticRangeContext(duplicate, range);

    expect(context.presence).toBe("fully_present");
    expect(context.occurrences).toHaveLength(2);
  });

  it("does not double-count overlapping duplicate coverage", () => {
    const project = createVideoProject(asset);
    const trimmed = trimClip(project, project.clips[0].id, 0, 6);
    const duplicate = duplicateClip(trimmed, trimmed.clips[0].id);
    const range = createSemanticRange({
      ...rangeFor(duplicate),
      sourceAnchors: [{
        assetId: duplicate.assets[0].id,
        sourceStart: 0,
        sourceEnd: 10,
      }],
    });

    expect(getSemanticRangeContext(duplicate, range).presence).toBe("partially_present");
  });

  it("rejects duplicate semantic range IDs in persisted projects", () => {
    const project = createVideoProject(asset);
    const range = rangeFor(project);
    const invalid = { ...project, semanticRanges: [range, { ...range, title: "Duplicate" }] };

    expect(validateTimelineProject(invalid)).toBe(false);
  });

  it("validates ranges against project assets and source bounds", () => {
    const project = createVideoProject(asset);
    const range = rangeFor(project);

    expect(validateSemanticRangeInProject(project, range)).toBe(true);
    expect(validateSemanticRangeInProject(project, {
      ...range,
      sourceAnchors: [{ ...range.sourceAnchors[0], assetId: "missing" }],
    })).toBe(false);
    expect(validateSemanticRangeInProject(project, {
      ...range,
      sourceAnchors: [{ ...range.sourceAnchors[0], sourceEnd: 21 }],
    })).toBe(false);
  });
});
