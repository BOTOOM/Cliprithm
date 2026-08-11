import type {
  SemanticRange,
  SemanticRangeAnchor,
  SemanticRangeContext,
  SemanticRangeOccurrence,
  TimelineProject,
} from "../../types";
import {
  getAsset,
  getPositionedClips,
  MIN_CLIP_DURATION,
  sourceTimeToTimelineTime,
} from "./timeline";

export const MAX_SEMANTIC_RANGES = 10_000;
export const MAX_SEMANTIC_RANGE_ANCHORS = 100;
export const MAX_SEMANTIC_RANGE_TAGS = 20;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `range-${crypto.randomUUID()}`;
  }
  return `range-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeSemanticTags(tags: string[]): string[] {
  return [...new Set(
    tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 64))
  )].slice(0, MAX_SEMANTIC_RANGE_TAGS);
}

export function createSemanticRange(input: {
  title: string;
  description: string;
  tags?: string[];
  timelineStart?: number | null;
  timelineEnd?: number | null;
  sourceAnchors?: SemanticRangeAnchor[];
  createdBy: SemanticRange["createdBy"];
}): SemanticRange {
  const timestamp = nowIso();
  return {
    id: createId(),
    title: input.title.trim(),
    description: input.description.trim(),
    tags: normalizeSemanticTags(input.tags ?? []),
    timelineStart: input.timelineStart ?? null,
    timelineEnd: input.timelineEnd ?? null,
    sourceAnchors: (input.sourceAnchors ?? []).map((anchor) => ({ ...anchor })),
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function anchorDuration(anchor: SemanticRangeAnchor): number {
  return Math.max(0, anchor.sourceEnd - anchor.sourceStart);
}

function mergedIntervalLength(intervals: Array<[number, number]>): number {
  const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
  let covered = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;

  for (const [start, end] of sorted) {
    if (currentStart === null) {
      currentStart = start;
      currentEnd = end;
      continue;
    }
    if (start > currentEnd) {
      covered += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else {
      currentEnd = Math.max(currentEnd, end);
    }
  }

  return currentStart === null ? covered : covered + currentEnd - currentStart;
}

export function getSemanticRangeContext(
  project: TimelineProject,
  range: SemanticRange
): SemanticRangeContext {
  if (range.timelineStart !== null && range.timelineEnd !== null) {
    const occurrences: SemanticRangeOccurrence[] = [];
    const timelineDuration = range.timelineEnd - range.timelineStart;
    let coveredTimelineDuration = 0;
    getPositionedClips(project).forEach((clip) => {
      const timelineStart = Math.max(range.timelineStart!, clip.timelineStart);
      const timelineEnd = Math.min(range.timelineEnd!, clip.timelineEnd);
      if (timelineEnd - timelineStart < MIN_CLIP_DURATION) return;
      const sourceStart = clip.sourceStart + (timelineStart - clip.timelineStart) * clip.speed;
      const sourceEnd = clip.sourceStart + (timelineEnd - clip.timelineStart) * clip.speed;
      coveredTimelineDuration += timelineEnd - timelineStart;
      occurrences.push({
        anchorIndex: occurrences.length,
        clipId: clip.id,
        timelineStart,
        timelineEnd,
        sourceStart,
        sourceEnd,
        coverage: timelineDuration > 0 ? (timelineEnd - timelineStart) / timelineDuration : 0,
      });
    });
    const coverage = timelineDuration > 0 ? coveredTimelineDuration / timelineDuration : 0;
    const presence =
      coverage >= 1 - 1e-6
        ? "fully_present"
        : coverage > 0
          ? "partially_present"
          : "not_present";
    return {
      range: {
        ...range,
        sourceAnchors: sourceAnchorsFromTimelineSelection(project, range.timelineStart, range.timelineEnd),
      },
      occurrences,
      presence,
    };
  }

  const occurrences: SemanticRangeOccurrence[] = [];
  let totalSourceDuration = 0;
  let coveredSourceDuration = 0;

  range.sourceAnchors.forEach((anchor, anchorIndex) => {
    const duration = anchorDuration(anchor);
    totalSourceDuration += duration;
    const coveredIntervals: Array<[number, number]> = [];
    const clips = getPositionedClips(project).filter((clip) => clip.assetId === anchor.assetId);

    for (const clip of clips) {
      const sourceStart = Math.max(anchor.sourceStart, clip.sourceStart);
      const sourceEnd = Math.min(anchor.sourceEnd, clip.sourceEnd);
      const overlap = sourceEnd - sourceStart;
      if (overlap < MIN_CLIP_DURATION) continue;

      const timelineStart = sourceTimeToTimelineTime(project, clip.id, sourceStart);
      const timelineEnd = sourceTimeToTimelineTime(project, clip.id, sourceEnd);
      if (timelineStart === null || timelineEnd === null || timelineEnd <= timelineStart) continue;

      coveredIntervals.push([sourceStart, sourceEnd]);
      occurrences.push({
        anchorIndex,
        clipId: clip.id,
        timelineStart,
        timelineEnd,
        sourceStart,
        sourceEnd,
        coverage: duration > 0 ? overlap / duration : 0,
      });
    }

    coveredSourceDuration += mergedIntervalLength(coveredIntervals);
  });

  const coverage = totalSourceDuration > 0 ? coveredSourceDuration / totalSourceDuration : 0;
  const presence =
    coverage >= 1 - 1e-6
      ? "fully_present"
      : coverage > 0
        ? "partially_present"
        : "not_present";

  return { range, occurrences, presence };
}

export function getSemanticRangeContexts(project: TimelineProject): SemanticRangeContext[] {
  return project.semanticRanges.map((range) => getSemanticRangeContext(project, range));
}

export function synchronizeSemanticRangeSourceAnchors(project: TimelineProject): TimelineProject {
  return {
    ...project,
    semanticRanges: project.semanticRanges.map((range) => {
      if (range.timelineStart === null || range.timelineEnd === null) return range;
      return {
        ...range,
        sourceAnchors: sourceAnchorsFromTimelineSelection(project, range.timelineStart, range.timelineEnd),
      };
    }),
  };
}

export function validateSemanticRangeInProject(
  project: TimelineProject,
  range: SemanticRange
): boolean {
  const hasTimelinePlacement = range.timelineStart !== null || range.timelineEnd !== null;
  if (
    typeof range.id !== "string" ||
    range.id.length === 0 ||
    typeof range.title !== "string" ||
    range.title.trim().length === 0 ||
    range.title.length > 120 ||
    typeof range.description !== "string" ||
    range.description.trim().length === 0 ||
    range.description.length > 4_000 ||
    !Array.isArray(range.tags) ||
    range.tags.length > MAX_SEMANTIC_RANGE_TAGS ||
    !range.tags.every((tag) => typeof tag === "string" && tag.trim().length > 0 && tag.length <= 64) ||
    !["user", "ai"].includes(range.createdBy) ||
    !Array.isArray(range.sourceAnchors) ||
    range.sourceAnchors.length > MAX_SEMANTIC_RANGE_ANCHORS ||
    (!hasTimelinePlacement && range.sourceAnchors.length === 0) ||
    (hasTimelinePlacement &&
      (!Number.isFinite(range.timelineStart) ||
        !Number.isFinite(range.timelineEnd) ||
        range.timelineStart! < 0 ||
        range.timelineEnd! - range.timelineStart! < MIN_CLIP_DURATION))
  ) return false;

  return range.sourceAnchors.every((anchor) => {
    if (
      !anchor ||
      typeof anchor.assetId !== "string" ||
      anchor.assetId.length === 0 ||
      !Number.isFinite(anchor.sourceStart) ||
      !Number.isFinite(anchor.sourceEnd)
    ) return false;
    const asset = getAsset(project, anchor.assetId);
    const duration = asset?.metadata?.duration;
    return Boolean(
      asset &&
      anchor.sourceStart >= 0 &&
      anchor.sourceEnd - anchor.sourceStart >= MIN_CLIP_DURATION &&
      (!Number.isFinite(duration) || anchor.sourceEnd <= Number(duration))
    );
  });
}

export function sourceAnchorsFromTimelineSelection(
  project: TimelineProject,
  timelineStart: number,
  timelineEnd: number
): SemanticRangeAnchor[] {
  if (!Number.isFinite(timelineStart) || !Number.isFinite(timelineEnd) || timelineEnd <= timelineStart) {
    return [];
  }

  return getPositionedClips(project).flatMap((clip) => {
    const overlapStart = Math.max(timelineStart, clip.timelineStart);
    const overlapEnd = Math.min(timelineEnd, clip.timelineEnd);
    if (overlapEnd - overlapStart < MIN_CLIP_DURATION) return [];
    return [{
      assetId: clip.assetId,
      sourceStart: clip.sourceStart + (overlapStart - clip.timelineStart) * clip.speed,
      sourceEnd: clip.sourceStart + (overlapEnd - clip.timelineStart) * clip.speed,
    }];
  });
}
