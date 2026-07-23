import type {
  ClipSegment,
  MediaAsset,
  TimelineClip,
  SilenceSegment,
  TimelineProject,
  TimelineTrack,
  VideoMetadata,
} from "../../types";

export const MIN_CLIP_DURATION = 0.08;
export const MIN_CLIP_SPEED = 0.25;
export const MAX_CLIP_SPEED = 32;
export const PRIMARY_VIDEO_TRACK_ID = "track-video-1";

export const MAX_PROJECT_ASSETS = 10_000;
export const MAX_PROJECT_CLIPS = 100_000;

export interface PositionedTimelineClip extends TimelineClip {
  timelineStart: number;
  timelineEnd: number;
  timelineDuration: number;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed));
}

function cloneProject(project: TimelineProject): TimelineProject {
  return {
    ...project,
    assets: [...project.assets],
    tracks: project.tracks.map((track) => ({ ...track, clipIds: [...track.clipIds] })),
    clips: project.clips.map((clip) => ({ ...clip })),
  };
}

function updateRevision(project: TimelineProject): TimelineProject {
  return { ...project, revision: project.revision + 1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sourceBoundsForClip(project: TimelineProject, clip: TimelineClip): { start: number; end: number } {
  const assetDuration = getAsset(project, clip.assetId)?.metadata?.duration;
  const fallbackEnd = finiteNumber(assetDuration) && assetDuration >= clip.sourceEnd
    ? assetDuration
    : clip.sourceEnd;
  const bounds = clip.sourceBounds;
  if (
    bounds &&
    finiteNumber(bounds.start) &&
    finiteNumber(bounds.end) &&
    bounds.start >= 0 &&
    bounds.end - bounds.start >= MIN_CLIP_DURATION
  ) {
    return { start: bounds.start, end: bounds.end };
  }
  return { start: 0, end: fallbackEnd };
}

function validMediaAsset(value: unknown): value is MediaAsset {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 256 ||
    typeof value.path !== "string" ||
    value.path.length === 0 ||
    value.path.length > 32_768 ||
    typeof value.name !== "string" ||
    value.name.length > 512 ||
    !["video", "image", "gif", "audio", "text"].includes(String(value.kind)) ||
    (value.metadata !== null && !isRecord(value.metadata))
  ) {
    return false;
  }
  if (value.metadata === null) return true;
  const metadata = value.metadata as Record<string, unknown>;
  return (
    finiteNumber(metadata.duration) && metadata.duration >= 0 &&
    typeof metadata.width === "number" && Number.isInteger(metadata.width) && metadata.width >= 0 &&
    typeof metadata.height === "number" && Number.isInteger(metadata.height) && metadata.height >= 0 &&
    finiteNumber(metadata.fps) && metadata.fps >= 0 &&
    typeof metadata.codec === "string" && metadata.codec.length <= 128 &&
    typeof metadata.file_size === "number" && Number.isInteger(metadata.file_size) && metadata.file_size >= 0 &&
    typeof metadata.has_audio === "boolean"
  );
}

function validTimelineTrack(value: unknown): value is TimelineTrack {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    ["video", "audio", "overlay"].includes(String(value.kind)) &&
    Array.isArray(value.clipIds) &&
    value.clipIds.every((id) => typeof id === "string") &&
    typeof value.muted === "boolean" &&
    typeof value.locked === "boolean" &&
    typeof value.visible === "boolean"
  );
}

function validTimelineClip(value: unknown): value is TimelineClip {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.assetId === "string" &&
    typeof value.trackId === "string" &&
    finiteNumber(value.sourceStart) &&
    finiteNumber(value.sourceEnd) &&
    value.sourceStart >= 0 &&
    value.sourceEnd - value.sourceStart >= MIN_CLIP_DURATION &&
    (value.sourceBounds === undefined || (
      isRecord(value.sourceBounds) &&
      finiteNumber(value.sourceBounds.start) &&
      finiteNumber(value.sourceBounds.end) &&
      value.sourceBounds.start >= 0 &&
      value.sourceBounds.end - value.sourceBounds.start >= MIN_CLIP_DURATION &&
      value.sourceStart >= value.sourceBounds.start &&
      value.sourceEnd <= value.sourceBounds.end
    )) &&
    finiteNumber(value.speed) &&
    value.speed >= MIN_CLIP_SPEED &&
    value.speed <= MAX_CLIP_SPEED &&
    typeof value.label === "string"
  );
}

export function validateTimelineProject(value: unknown): value is TimelineProject {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !finiteNumber(value.revision) ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  ) return false;
  if (!Array.isArray(value.assets) || value.assets.length > MAX_PROJECT_ASSETS) return false;
  if (!Array.isArray(value.tracks) || !Array.isArray(value.clips) || value.clips.length > MAX_PROJECT_CLIPS) {
    return false;
  }
  if (!value.tracks.some((track) => isRecord(track) && track.id === PRIMARY_VIDEO_TRACK_ID && track.kind === "video")) {
    return false;
  }
  if (!value.assets.every(validMediaAsset) || !value.tracks.every(validTimelineTrack) || !value.clips.every(validTimelineClip)) {
    return false;
  }

  const assetIds = new Set(value.assets.map((asset) => asset.id));
  const clipIds = new Set(value.clips.map((clip) => clip.id));
  const trackIds = new Set(value.tracks.map((track) => track.id));
  if (assetIds.size !== value.assets.length || clipIds.size !== value.clips.length || trackIds.size !== value.tracks.length) {
    return false;
  }

  const referencedClipIds = new Set<string>();
  for (const clip of value.clips) {
    const asset = value.assets.find((candidate) => candidate.id === clip.assetId);
    if (!asset || !trackIds.has(clip.trackId)) return false;
    if (asset.metadata && finiteNumber(asset.metadata.duration)) {
      if (clip.sourceEnd > asset.metadata.duration) return false;
    }
  }
  for (const track of value.tracks) {
    for (const clipId of track.clipIds) {
      if (!clipIds.has(clipId) || referencedClipIds.has(clipId)) return false;
      referencedClipIds.add(clipId);
    }
  }
  return referencedClipIds.size === value.clips.length;
}

export function migrateLegacyProject(input: {
  asset: Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>;
  clipSegments?: ClipSegment[];
}): TimelineProject {
  const project = createVideoProject(input.asset);
  const duration = input.asset.metadata?.duration ?? 0;
  const ranges = (input.clipSegments ?? [])
    .filter(
      (clip) =>
        finiteNumber(clip.start) &&
        finiteNumber(clip.end) &&
        clip.end - clip.start >= MIN_CLIP_DURATION
    )
    .map((clip) => ({
      start: Math.max(0, Math.min(duration, clip.start)),
      end: Math.max(0, Math.min(duration, clip.end)),
      label: clip.label,
    }))
    .filter((clip) => clip.end - clip.start >= MIN_CLIP_DURATION);

  if (ranges.length === 0) return project;
  const track = project.tracks[0];
  const firstClip = project.clips[0];
  const clips = ranges.map((range, index) => ({
    ...firstClip,
    id: createId("clip"),
    sourceStart: range.start,
    sourceEnd: range.end,
    sourceBounds: { start: 0, end: duration },
    label: range.label || `${project.assets[0].name} ${String(index + 1).padStart(2, "0")}`,
    createdByActionId: "project.migrateLegacy",
  }));
  return {
    ...project,
    clips,
    tracks: [{ ...track, clipIds: clips.map((clip) => clip.id) }],
    revision: 1,
  };
}

export function createVideoProject(
  asset: Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>
): TimelineProject {
  const assetId = asset.id ?? createId("asset");
  const track: TimelineTrack = {
    id: PRIMARY_VIDEO_TRACK_ID,
    kind: "video",
    name: "Video",
    clipIds: [],
    muted: false,
    locked: false,
    visible: true,
  };
  const duration = finiteNumber(asset.metadata?.duration) ? Math.max(0, asset.metadata.duration) : 0;
  const clips: TimelineClip[] = duration >= MIN_CLIP_DURATION
    ? [{
        id: createId("clip"),
        assetId,
        trackId: track.id,
        sourceStart: 0,
        sourceEnd: duration,
        sourceBounds: { start: 0, end: duration },
        speed: 1,
        label: asset.name,
      }]
    : [];
  track.clipIds.push(...clips.map((clip) => clip.id));
  return {
    schemaVersion: 1,
    assets: [{ ...asset, id: assetId, kind: asset.kind ?? "video" }],
    tracks: [track],
    clips,
    revision: 1,
  };
}

export function getPrimaryVideoTrack(project: TimelineProject): TimelineTrack {
  return (
    project.tracks.find((track) => track.kind === "video") ?? {
      id: PRIMARY_VIDEO_TRACK_ID,
      kind: "video",
      name: "Video",
      clipIds: [],
      muted: false,
      locked: false,
      visible: true,
    }
  );
}

export function getClip(project: TimelineProject, clipId: string): TimelineClip | null {
  return project.clips.find((clip) => clip.id === clipId) ?? null;
}

export function getAsset(project: TimelineProject, assetId: string): MediaAsset | null {
  return project.assets.find((asset) => asset.id === assetId) ?? null;
}

export function getPositionedClips(project: TimelineProject, trackId = PRIMARY_VIDEO_TRACK_ID): PositionedTimelineClip[] {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return [];

  let cursor = 0;
  return track.clipIds.flatMap((clipId) => {
    const clip = getClip(project, clipId);
    if (!clip) return [];
    const timelineDuration = Math.max(0, (clip.sourceEnd - clip.sourceStart) / clampSpeed(clip.speed));
    const positioned = {
      ...clip,
      timelineStart: cursor,
      timelineEnd: cursor + timelineDuration,
      timelineDuration,
    };
    cursor += timelineDuration;
    return [positioned];
  });
}

export function getTimelineDuration(project: TimelineProject, trackId = PRIMARY_VIDEO_TRACK_ID): number {
  return getPositionedClips(project, trackId).reduce(
    (total, clip) => total + clip.timelineDuration,
    0
  );
}

export function sourceTimeToTimelineTime(
  project: TimelineProject,
  clipId: string,
  sourceTime: number
): number | null {
  if (!finiteNumber(sourceTime)) return null;
  const clip = getPositionedClips(project).find((candidate) => candidate.id === clipId);
  if (!clip) return null;
  const bounded = Math.min(clip.sourceEnd, Math.max(clip.sourceStart, sourceTime));
  return clip.timelineStart + (bounded - clip.sourceStart) / clampSpeed(clip.speed);
}

export function timelineTimeToSourceTime(
  project: TimelineProject,
  timelineTime: number
): { clip: PositionedTimelineClip; sourceTime: number } | null {
  if (!finiteNumber(timelineTime)) return null;
  const clips = getPositionedClips(project);
  const bounded = Math.max(0, Math.min(getTimelineDuration(project), timelineTime));
  const clip = clips.find(
    (candidate) => bounded >= candidate.timelineStart && bounded <= candidate.timelineEnd
  ) ?? clips[clips.length - 1];
  if (!clip) return null;
  return {
    clip,
    sourceTime: Math.min(
      clip.sourceEnd,
      clip.sourceStart + (bounded - clip.timelineStart) * clampSpeed(clip.speed)
    ),
  };
}

export function splitClipAtTimelineTime(
  project: TimelineProject,
  clipId: string,
  timelineTime: number
): TimelineProject {
  if (!finiteNumber(timelineTime)) return project;
  const positioned = getPositionedClips(project).find((clip) => clip.id === clipId);
  if (!positioned) return project;
  const sourceSplit = positioned.sourceStart +
    (timelineTime - positioned.timelineStart) * clampSpeed(positioned.speed);
  if (
    sourceSplit <= positioned.sourceStart + MIN_CLIP_DURATION ||
    sourceSplit >= positioned.sourceEnd - MIN_CLIP_DURATION
  ) {
    return project;
  }

  if (project.clips.length >= MAX_PROJECT_CLIPS) return project;
  const next = cloneProject(project);
  const originalIndex = next.clips.findIndex((clip) => clip.id === clipId);
  const original = next.clips[originalIndex];
  const first: TimelineClip = {
    ...original,
    id: createId("clip"),
    sourceEnd: sourceSplit,
    createdByActionId: "clip.splitAtPlayhead",
  };
  const second: TimelineClip = {
    ...original,
    id: createId("clip"),
    sourceStart: sourceSplit,
    createdByActionId: "clip.splitAtPlayhead",
  };
  next.clips.splice(originalIndex, 1, first, second);
  const track = next.tracks.find((candidate) => candidate.id === original.trackId);
  if (track) {
    const trackIndex = track.clipIds.indexOf(clipId);
    track.clipIds.splice(trackIndex, 1, first.id, second.id);
  }
  return updateRevision(next);
}

export function trimClip(
  project: TimelineProject,
  clipId: string,
  sourceStart: number,
  sourceEnd: number
): TimelineProject {
  const clip = getClip(project, clipId);
  if (!clip || !finiteNumber(sourceStart) || !finiteNumber(sourceEnd)) return project;
  if (sourceEnd - sourceStart < MIN_CLIP_DURATION) return project;
  if (sourceStart < 0 || sourceEnd <= sourceStart) return project;

  const next = cloneProject(project);
  const target = next.clips.find((candidate) => candidate.id === clipId);
  if (!target) return project;
  const sourceBounds = sourceBoundsForClip(project, clip);
  target.sourceBounds = sourceBounds;
  target.sourceStart = Math.max(sourceBounds.start, Math.min(sourceBounds.end, sourceStart));
  target.sourceEnd = Math.min(sourceBounds.end, Math.max(sourceBounds.start, sourceEnd));
  if (target.sourceEnd - target.sourceStart < MIN_CLIP_DURATION) return project;
  target.createdByActionId = "clip.trim";
  return updateRevision(next);
}

export function moveClip(project: TimelineProject, clipId: string, destinationIndex: number): TimelineProject {
  const next = cloneProject(project);
  const clip = getClip(next, clipId);
  if (!clip) return project;
  const track = next.tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track) return project;
  const currentIndex = track.clipIds.indexOf(clipId);
  if (currentIndex < 0) return project;
  const boundedIndex = Math.max(0, Math.min(track.clipIds.length - 1, destinationIndex));
  if (currentIndex === boundedIndex) return project;
  track.clipIds.splice(currentIndex, 1);
  track.clipIds.splice(boundedIndex, 0, clipId);
  return updateRevision(next);
}

export function duplicateClip(project: TimelineProject, clipId: string): TimelineProject {
  if (project.clips.length >= MAX_PROJECT_CLIPS) return project;
  const next = cloneProject(project);
  const clip = getClip(next, clipId);
  if (!clip) return project;
  const track = next.tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track) return project;
  const index = track.clipIds.indexOf(clipId);
  const duplicate: TimelineClip = {
    ...clip,
    id: createId("clip"),
    label: `${clip.label} Copy`,
    createdByActionId: "clip.duplicate",
  };
  next.clips.push(duplicate);
  track.clipIds.splice(index + 1, 0, duplicate.id);
  return updateRevision(next);
}

export function deleteClip(project: TimelineProject, clipId: string): TimelineProject {
  const next = cloneProject(project);
  const clipIndex = next.clips.findIndex((clip) => clip.id === clipId);
  if (clipIndex < 0) return project;
  const clip = next.clips[clipIndex];
  const track = next.tracks.find((candidate) => candidate.id === clip.trackId);
  if (!track || track.clipIds.length <= 1) return project;
  track.clipIds = track.clipIds.filter((id) => id !== clipId);
  next.clips.splice(clipIndex, 1);
  return updateRevision(next);
}

export function setClipSpeed(project: TimelineProject, clipId: string, speed: number): TimelineProject {
  const next = cloneProject(project);
  const clip = next.clips.find((candidate) => candidate.id === clipId);
  if (!clip) return project;
  const nextSpeed = clampSpeed(speed);
  if (clip.speed === nextSpeed) return project;
  clip.speed = nextSpeed;
  clip.createdByActionId = "clip.setSpeed";
  return updateRevision(next);
}

export function replaceClipWithSilenceCandidate(
  project: TimelineProject,
  clipId: string,
  silenceSegments: SilenceSegment[]
): TimelineProject {
  const original = getClip(project, clipId);
  if (!original || project.clips.length >= MAX_PROJECT_CLIPS) return project;
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = original.sourceStart;
  for (const silence of [...silenceSegments]
    .filter(
      (segment) =>
        finiteNumber(segment.start) &&
        finiteNumber(segment.end) &&
        segment.end > segment.start
    )
    .sort((a, b) => a.start - b.start)) {
    const start = Math.max(original.sourceStart, silence.start);
    const end = Math.min(original.sourceEnd, silence.end);
    if (start > cursor + MIN_CLIP_DURATION) ranges.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < original.sourceEnd - MIN_CLIP_DURATION) {
    ranges.push({ start: cursor, end: original.sourceEnd });
  }
  if (ranges.length === 0 || project.clips.length - 1 + ranges.length > MAX_PROJECT_CLIPS) {
    return project;
  }

  const next = cloneProject(project);
  const target = next.clips.find((clip) => clip.id === clipId);
  if (!target) return project;
  const replacement = ranges.map((range, index) => ({
    ...target,
    id: createId("clip"),
    sourceStart: range.start,
    sourceEnd: range.end,
    label: `${target.label} ${String(index + 1).padStart(2, "0")}`,
    createdByActionId: "analysis.acceptCandidate",
  }));
  const targetIndex = next.clips.findIndex((clip) => clip.id === clipId);
  next.clips.splice(targetIndex, 1, ...replacement);
  const track = next.tracks.find((candidate) => candidate.id === target.trackId);
  if (track) {
    const trackIndex = track.clipIds.indexOf(clipId);
    track.clipIds.splice(trackIndex, 1, ...replacement.map((clip) => clip.id));
  }
  return updateRevision(next);
}

export function addVideoAsset(
  project: TimelineProject,
  asset: Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>
): TimelineProject {
  if (project.assets.length >= MAX_PROJECT_ASSETS || project.clips.length >= MAX_PROJECT_CLIPS) {
    return project;
  }
  const next = cloneProject(project);
  const assetId = asset.id && !next.assets.some((candidate) => candidate.id === asset.id)
    ? asset.id
    : createId("asset");
  const track = next.tracks.find((candidate) => candidate.id === PRIMARY_VIDEO_TRACK_ID);
  if (!track) return project;
  const duration = finiteNumber(asset.metadata?.duration) ? Math.max(0, asset.metadata.duration) : 0;
  const clip: TimelineClip | null = duration >= MIN_CLIP_DURATION
    ? {
        id: createId("clip"),
        assetId,
        trackId: track.id,
        sourceStart: 0,
        sourceEnd: duration,
        sourceBounds: { start: 0, end: duration },
        speed: 1,
        label: asset.name,
        createdByActionId: "asset.addVideo",
      }
    : null;
  next.assets.push({ ...asset, id: assetId, kind: asset.kind ?? "video" });
  const targetTrack = next.tracks.find((candidate) => candidate.id === track.id);
  if (targetTrack && clip) targetTrack.clipIds.push(clip.id);
  if (clip) next.clips.push(clip);
  return updateRevision(next);
}

export function getSourceMetadata(project: TimelineProject, clipId: string): VideoMetadata | null {
  const clip = getClip(project, clipId);
  return clip ? getAsset(project, clip.assetId)?.metadata ?? null : null;
}
