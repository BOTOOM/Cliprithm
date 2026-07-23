import { describe, expect, it } from "vitest";
import {
  createVideoProject,
  getTimelineDuration,
  migrateLegacyProject,
  splitClipAtTimelineTime,
  sourceTimeToTimelineTime,
  timelineTimeToSourceTime,
  trimClip,
  validateTimelineProject,
  setClipSpeed,
  moveClip,
  replaceClipWithSilenceCandidate,
  addVideoAsset,
  duplicateClip,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_CLIPS,
} from "./timeline";
import type { ClipSegment, MediaAsset } from "../../types";

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

function projectWithTwoClips() {
  const project = createVideoProject(asset);
  const second = migrateLegacyProject({
    asset: { ...asset, id: project.assets[0].id },
    clipSegments: [
      { id: "legacy-1", label: "first", start: 0, end: 5, duration: 5 },
      { id: "legacy-2", label: "second", start: 5, end: 10, duration: 5 },
    ],
  });
  return second;
}

describe("timeline model", () => {
  it("creates a valid full-source project", () => {
    const project = createVideoProject(asset);
    expect(validateTimelineProject(project)).toBe(true);
    expect(getTimelineDuration(project)).toBe(20);
  });

  it("converts legacy clip ranges without changing source ranges", () => {
    const ranges: ClipSegment[] = [
      { id: "one", label: "One", start: 1, end: 4, duration: 3 },
      { id: "two", label: "Two", start: 8, end: 12, duration: 4 },
    ];
    const project = migrateLegacyProject({ asset, clipSegments: ranges });
    expect(validateTimelineProject(project)).toBe(true);
    expect(project.clips.map((clip) => [clip.sourceStart, clip.sourceEnd])).toEqual([
      [1, 4],
      [8, 12],
    ]);
  });

  it("rejects invalid references, non-finite ranges, and out-of-bounds clips", () => {
    const project = createVideoProject(asset);
    const invalid = {
      ...project,
      clips: [{ ...project.clips[0], sourceStart: Number.NaN }],
    };
    const missingReference = {
      ...project,
      clips: [{ ...project.clips[0], assetId: "missing" }],
    };
    const outOfBounds = {
      ...project,
      clips: [{ ...project.clips[0], sourceEnd: 21 }],
    };
    expect(validateTimelineProject(invalid)).toBe(false);
    expect(validateTimelineProject(missingReference)).toBe(false);
    expect(validateTimelineProject(outOfBounds)).toBe(false);
  });

  it("does not create a zero-duration clip", () => {
    const empty = createVideoProject({ ...asset, metadata: { ...asset.metadata!, duration: 0 } });
    expect(empty.clips).toHaveLength(0);
    expect(validateTimelineProject(empty)).toBe(true);
  });

  it("trims non-destructively and can restore the original source range", () => {
    const project = createVideoProject(asset);
    const clipId = project.clips[0].id;
    const trimmed = trimClip(project, clipId, 2, 8);
    expect(trimmed.clips[0].sourceStart).toBe(2);
    expect(trimmed.clips[0].sourceEnd).toBe(8);
    expect(trimmed.clips[0].sourceBounds).toEqual({ start: 0, end: 20 });

    const expanded = trimClip(trimmed, clipId, 0, 12);
    expect(expanded.clips[0].sourceStart).toBe(0);
    expect(expanded.clips[0].sourceEnd).toBe(12);
    expect(trimClip(expanded, clipId, Number.NaN, 5)).toBe(expanded);
  });

  it("rejects source bounds that do not contain a clip", () => {
    const project = createVideoProject(asset);
    const invalid = {
      ...project,
      clips: [{ ...project.clips[0], sourceBounds: { start: 2, end: 8 } }],
    };
    expect(validateTimelineProject(invalid)).toBe(false);
  });

  it("splits using timeline time and preserves speed mapping", () => {
    const project = setClipSpeed(createVideoProject(asset), "missing", 2);
    const clipId = project.clips[0].id;
    const spedUp = setClipSpeed(project, clipId, 2);
    const split = splitClipAtTimelineTime(spedUp, clipId, 3);
    expect(split.clips).toHaveLength(2);
    expect(split.clips.map((clip) => [clip.sourceStart, clip.sourceEnd])).toEqual([
      [0, 6],
      [6, 20],
    ]);
    expect(sourceTimeToTimelineTime(spedUp, clipId, 6)).toBe(3);
    expect(timelineTimeToSourceTime(spedUp, 3)?.sourceTime).toBe(6);
  });

  it("accepts a silence candidate as a non-destructive clip replacement", () => {
    const project = createVideoProject(asset);
    const clipId = project.clips[0].id;
    const accepted = replaceClipWithSilenceCandidate(project, clipId, [
      { start: 5, end: 7, duration: 2 },
    ]);
    expect(accepted.clips.map((clip) => [clip.sourceStart, clip.sourceEnd])).toEqual([
      [0, 5],
      [7, 20],
    ]);
    expect(project.clips[0].sourceStart).toBe(0);
    expect(project.clips[0].sourceEnd).toBe(20);
    expect(validateTimelineProject(accepted)).toBe(true);
  });

  it("orders clips without introducing a gap", () => {
    const project = projectWithTwoClips();
    const first = project.tracks[0].clipIds[0];
    const moved = moveClip(project, first, 1);
    expect(moved.tracks[0].clipIds[1]).toBe(first);
    expect(getTimelineDuration(moved)).toBe(10);
  });

  it("rejects mutations that exceed project asset and clip limits", () => {
    const project = createVideoProject(asset);
    const atAssetLimit = {
      ...project,
      assets: Array.from({ length: MAX_PROJECT_ASSETS }, (_, index) => ({
        ...project.assets[0],
        id: `asset-${index}`,
      })),
    };
    expect(addVideoAsset(atAssetLimit, asset)).toBe(atAssetLimit);

    const atClipLimit = {
      ...project,
      clips: Array.from({ length: MAX_PROJECT_CLIPS }, (_, index) => ({
        ...project.clips[0],
        id: `clip-${index}`,
      })),
    };
    expect(duplicateClip(atClipLimit, atClipLimit.clips[0].id)).toBe(atClipLimit);
  });
});
