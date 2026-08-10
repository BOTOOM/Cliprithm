import type {
  MediaAsset,
  SemanticRange,
  SilenceSegment,
  TimelineProject,
} from "../../types";
import {
  MAX_CLIP_SPEED,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_CLIPS,
  MIN_CLIP_DURATION,
  MIN_CLIP_SPEED,
  clipSourceTimeAtTimelineTime,
  getClip,
  getPositionedClips,
} from "./timeline";
import {
  MAX_SEMANTIC_RANGES,
  validateSemanticRangeInProject,
} from "./semanticRanges";

type VideoAssetInput = Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>;
type SilenceCandidates = Array<{ clipId: string; segments: SilenceSegment[] }>;
type SemanticRangeDraft = Omit<SemanticRange, "id" | "createdAt" | "updatedAt">;
type SemanticRangeUpdates = Partial<Pick<SemanticRange, "title" | "description" | "tags" | "sourceAnchors">>;

export type EditorAction =
  | { type: "asset.addVideo"; asset: VideoAssetInput }
  | { type: "asset.remove"; assetId: string }
  | { type: "selection.selectClip"; clipId: string | null }
  | { type: "selection.setPlayhead"; timelineTime: number }
  | { type: "selection.selectRange"; start: number; end: number }
  | { type: "clip.splitAtPlayhead"; clipId: string; timelineTime: number }
  | { type: "clip.trim"; clipId: string; sourceStart: number; sourceEnd: number }
  | { type: "clip.move"; clipId: string; destinationIndex: number }
  | { type: "clip.duplicate"; clipId: string }
  | { type: "clip.delete"; clipId: string }
  | { type: "clip.setSpeed"; clipId: string; speed: number }
  | { type: "clip.resetSpeed"; clipId: string }
  | {
      type: "analysis.acceptCandidate";
      projectRevision: number;
      candidates: SilenceCandidates;
    }
  | { type: "semanticRange.add"; range: SemanticRangeDraft }
  | { type: "semanticRange.update"; rangeId: string; updates: SemanticRangeUpdates }
  | { type: "semanticRange.delete"; rangeId: string }
  | { type: "history.undo" }
  | { type: "history.redo" };

export type EditorActionCategory =
  | "media"
  | "selection"
  | "edit"
  | "timing"
  | "analysis"
  | "annotation"
  | "history";
export type EditorActionMutation = "project" | "selection" | "history";
export type EditorActionMcpPolicy = "planned" | "internal";

export interface EditorActionDefinition {
  id: EditorAction["type"];
  category: EditorActionCategory;
  labelKey: string;
  inputSchema: string;
  preconditions: string[];
  mutation: EditorActionMutation;
  undoable: boolean;
  progress: "instant" | "background";
  mcp: EditorActionMcpPolicy;
}

const projectAction = (
  definition: Omit<EditorActionDefinition, "mutation" | "mcp">
): EditorActionDefinition => ({ ...definition, mutation: "project", mcp: "planned" });

export const EDITOR_ACTIONS: Record<EditorAction["type"], EditorActionDefinition> = {
  "asset.addVideo": projectAction({
    id: "asset.addVideo",
    category: "media",
    labelKey: "editor.addVideo",
    inputSchema: "VideoAssetInput",
    preconditions: ["project loaded", "supported video asset"],
    undoable: true,
    progress: "instant",
  }),
  "asset.remove": projectAction({
    id: "asset.remove",
    category: "media",
    labelKey: "editor.removeAsset",
    inputSchema: "assetId",
    preconditions: ["asset exists", "asset has no clip or semantic range references"],
    undoable: true,
    progress: "instant",
  }),
  "selection.selectClip": {
    id: "selection.selectClip",
    category: "selection",
    labelKey: "editor.selectedClip",
    inputSchema: "clipId | null",
    preconditions: ["project loaded", "clip exists when non-null"],
    mutation: "selection",
    undoable: false,
    progress: "instant",
    mcp: "planned",
  },
  "selection.setPlayhead": {
    id: "selection.setPlayhead",
    category: "selection",
    labelKey: "editor.play",
    inputSchema: "timeline seconds",
    preconditions: ["project loaded", "finite timeline time"],
    mutation: "selection",
    undoable: false,
    progress: "instant",
    mcp: "planned",
  },
  "selection.selectRange": {
    id: "selection.selectRange",
    category: "selection",
    labelKey: "editor.selectRange",
    inputSchema: "timeline start + end seconds",
    preconditions: ["project loaded", "finite ordered timeline range"],
    mutation: "selection",
    undoable: false,
    progress: "instant",
    mcp: "planned",
  },
  "clip.splitAtPlayhead": projectAction({
    id: "clip.splitAtPlayhead",
    category: "edit",
    labelKey: "editor.split",
    inputSchema: "clipId + timelineTime",
    preconditions: ["clip exists", "playhead is inside clip"],
    undoable: true,
    progress: "instant",
  }),
  "clip.trim": projectAction({
    id: "clip.trim",
    category: "edit",
    labelKey: "editor.trim",
    inputSchema: "clipId + sourceStart + sourceEnd",
    preconditions: ["clip exists", "valid source interval"],
    undoable: true,
    progress: "instant",
  }),
  "clip.move": projectAction({
    id: "clip.move",
    category: "edit",
    labelKey: "editor.moveRight",
    inputSchema: "clipId + destinationIndex",
    preconditions: ["clip exists", "primary track loaded"],
    undoable: true,
    progress: "instant",
  }),
  "clip.duplicate": projectAction({
    id: "clip.duplicate",
    category: "edit",
    labelKey: "editor.duplicate",
    inputSchema: "clipId",
    preconditions: ["clip exists"],
    undoable: true,
    progress: "instant",
  }),
  "clip.delete": projectAction({
    id: "clip.delete",
    category: "edit",
    labelKey: "editor.delete",
    inputSchema: "clipId",
    preconditions: ["clip exists", "at least one primary clip remains"],
    undoable: true,
    progress: "instant",
  }),
  "clip.setSpeed": projectAction({
    id: "clip.setSpeed",
    category: "timing",
    labelKey: "editor.speed",
    inputSchema: "clipId + speed[0.25..32]",
    preconditions: ["clip exists", "speed is finite and within bounds"],
    undoable: true,
    progress: "instant",
  }),
  "clip.resetSpeed": projectAction({
    id: "clip.resetSpeed",
    category: "timing",
    labelKey: "editor.resetSpeed",
    inputSchema: "clipId",
    preconditions: ["clip exists"],
    undoable: true,
    progress: "instant",
  }),
  "analysis.acceptCandidate": projectAction({
    id: "analysis.acceptCandidate",
    category: "analysis",
    labelKey: "editor.applyCandidate",
    inputSchema: "clipId[] + silence segments[]",
    preconditions: ["candidate matches current project revision"],
    undoable: true,
    progress: "instant",
  }),
  "semanticRange.add": projectAction({
    id: "semanticRange.add",
    category: "annotation",
    labelKey: "editor.addSemanticRange",
    inputSchema: "semantic range draft",
    preconditions: ["project loaded", "valid source anchors", "non-empty title and description"],
    undoable: true,
    progress: "instant",
  }),
  "semanticRange.update": projectAction({
    id: "semanticRange.update",
    category: "annotation",
    labelKey: "editor.updateSemanticRange",
    inputSchema: "rangeId + partial updates",
    preconditions: ["range exists", "updated anchors are valid"],
    undoable: true,
    progress: "instant",
  }),
  "semanticRange.delete": projectAction({
    id: "semanticRange.delete",
    category: "annotation",
    labelKey: "editor.deleteSemanticRange",
    inputSchema: "rangeId",
    preconditions: ["range exists"],
    undoable: true,
    progress: "instant",
  }),
  "history.undo": {
    id: "history.undo",
    category: "history",
    labelKey: "editor.undo",
    inputSchema: "none",
    preconditions: ["timeline undo stack is non-empty"],
    mutation: "history",
    undoable: false,
    progress: "instant",
    mcp: "planned",
  },
  "history.redo": {
    id: "history.redo",
    category: "history",
    labelKey: "editor.redo",
    inputSchema: "none",
    preconditions: ["timeline redo stack is non-empty"],
    mutation: "history",
    undoable: false,
    progress: "instant",
    mcp: "planned",
  },
};

export interface EditorActionValidationContext {
  timelineProject: TimelineProject | null;
  canUndoTimeline: boolean;
  canRedoTimeline: boolean;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isValidSilenceSegment(
  segment: SilenceSegment,
  clip: TimelineProject["clips"][number],
): boolean {
  if (
    !segment ||
    typeof segment !== "object" ||
    !isFiniteNumber(segment.start) ||
    !isFiniteNumber(segment.end) ||
    !isFiniteNumber(segment.duration)
  ) {
    return false;
  }
  const duration = segment.end - segment.start;
  const durationTolerance = Math.max(0.001, duration * 1e-6);
  return (
    segment.start >= clip.sourceStart &&
    segment.end <= clip.sourceEnd &&
    duration >= MIN_CLIP_DURATION &&
    Math.abs(segment.duration - duration) <= durationTolerance
  );
}

function silenceReplacementClipCount(
  clip: TimelineProject["clips"][number],
  candidateSegments: SilenceSegment[],
): number | null {
  const segments = candidateSegments.slice().sort((left, right) => left.start - right.start);
  let previousEnd = clip.sourceStart;
  for (const segment of segments) {
    if (!isValidSilenceSegment(segment, clip) || segment.start < previousEnd) return null;
    previousEnd = segment.end;
  }

  let cursor = clip.sourceStart;
  let replacementCount = 0;
  for (const segment of segments) {
    if (segment.start > cursor + MIN_CLIP_DURATION) replacementCount += 1;
    cursor = Math.max(cursor, segment.end);
  }
  if (cursor < clip.sourceEnd - MIN_CLIP_DURATION) replacementCount += 1;
  return replacementCount;
}

export function validateEditorAction(
  action: EditorAction,
  context: EditorActionValidationContext
): boolean {
  const project = context.timelineProject;
  const definition = EDITOR_ACTIONS[action.type];
  if (!definition) return false;

  if (action.type === "history.undo") return context.canUndoTimeline;
  if (action.type === "history.redo") return context.canRedoTimeline;
  if (!project) return false;

  switch (action.type) {
    case "selection.selectClip":
      return action.clipId === null || getClip(project, action.clipId) !== null;
    case "selection.setPlayhead": {
      const duration = getPositionedClips(project).reduce(
        (total, clip) => total + clip.timelineDuration,
        0
      );
      return Number.isFinite(action.timelineTime) && action.timelineTime >= 0 && action.timelineTime <= duration;
    }
    case "selection.selectRange": {
      const duration = getPositionedClips(project).reduce(
        (total, clip) => total + clip.timelineDuration,
        0
      );
      return (
        Number.isFinite(action.start) &&
        Number.isFinite(action.end) &&
        action.start >= 0 &&
        action.end > action.start &&
        action.end <= duration
      );
    }
    case "asset.addVideo":
      return (
        project.assets.length < MAX_PROJECT_ASSETS &&
        project.clips.length < MAX_PROJECT_CLIPS &&
        (action.asset.kind === undefined || action.asset.kind === "video") &&
        typeof action.asset.path === "string" &&
        action.asset.path.length > 0 &&
        action.asset.path.length <= 32_768 &&
        typeof action.asset.name === "string" &&
        action.asset.name.length > 0 &&
        action.asset.name.length <= 512 &&
        (!action.asset.metadata ||
          (Number.isFinite(action.asset.metadata.duration) &&
            action.asset.metadata.duration >= 0 &&
            Number.isInteger(action.asset.metadata.width) &&
            action.asset.metadata.width > 0 &&
            Number.isInteger(action.asset.metadata.height) &&
            action.asset.metadata.height > 0 &&
            Number.isFinite(action.asset.metadata.fps) &&
            action.asset.metadata.fps > 0))
      );
    case "asset.remove":
      return (
        project.assets.some((asset) => asset.id === action.assetId) &&
        !project.clips.some((clip) => clip.assetId === action.assetId) &&
        !project.semanticRanges.some((range) => range.sourceAnchors.some((anchor) => anchor.assetId === action.assetId))
      );
    case "clip.splitAtPlayhead": {
      const clip = getClip(project, action.clipId);
      const positioned = getPositionedClips(project).find(
        (candidate) => candidate.id === action.clipId
      );
      const sourceSplit = clipSourceTimeAtTimelineTime(
        project,
        action.clipId,
        action.timelineTime,
      );
      return Boolean(
        clip &&
          positioned &&
          sourceSplit !== null &&
          sourceSplit > positioned.sourceStart + MIN_CLIP_DURATION &&
          sourceSplit < positioned.sourceEnd - MIN_CLIP_DURATION &&
          project.clips.length < MAX_PROJECT_CLIPS
      );
    }
    case "clip.trim": {
      const clip = getClip(project, action.clipId);
      const bounds = clip?.sourceBounds;
      const start = bounds?.start ?? 0;
      const end = bounds?.end ?? clip?.sourceEnd ?? 0;
      return Boolean(
        clip &&
          isFiniteNumber(action.sourceStart) &&
          isFiniteNumber(action.sourceEnd) &&
          action.sourceStart >= start &&
          action.sourceEnd <= end &&
          action.sourceEnd - action.sourceStart >= 0.08
      );
    }
    case "clip.move": {
      const clip = getClip(project, action.clipId);
      const track = project.tracks.find((candidate) => candidate.id === clip?.trackId);
      return Boolean(
        clip &&
          track &&
          Number.isInteger(action.destinationIndex) &&
          action.destinationIndex >= 0 &&
          action.destinationIndex < track.clipIds.length
      );
    }
    case "clip.duplicate":
      return (
        typeof action.clipId === "string" &&
        project.clips.length < MAX_PROJECT_CLIPS &&
        getClip(project, action.clipId) !== null
      );
    case "clip.delete": {
      const clip = getClip(project, action.clipId);
      const track = project.tracks.find((candidate) => candidate.id === clip?.trackId);
      return Boolean(clip && track && track.clipIds.length > 1);
    }
    case "clip.setSpeed":
      return (
        typeof action.clipId === "string" &&
        isFiniteNumber(action.speed) &&
        action.speed >= MIN_CLIP_SPEED &&
        action.speed <= MAX_CLIP_SPEED &&
        getClip(project, action.clipId) !== null
      );
    case "clip.resetSpeed":
      return getClip(project, action.clipId) !== null;
    case "analysis.acceptCandidate": {
      if (
        !Number.isInteger(action.projectRevision) ||
        action.projectRevision !== project.revision ||
        !Array.isArray(action.candidates) ||
        action.candidates.length === 0
      ) {
        return false;
      }
      const candidateClipIds = new Set<string>();
      let replacementClipCount = 0;
      const candidatesValid = action.candidates.every((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        const clip = getClip(project, candidate.clipId);
        if (
          !clip ||
          candidateClipIds.has(candidate.clipId) ||
          !Array.isArray(candidate.segments) ||
          candidate.segments.length === 0 ||
          !candidate.segments.every(
            (segment) => Boolean(segment && typeof segment === "object")
          )
        ) {
          return false;
        }
        candidateClipIds.add(candidate.clipId);
        const replacementCount = silenceReplacementClipCount(clip, candidate.segments);
        if (replacementCount === null || replacementCount === 0) return false;
        replacementClipCount += replacementCount;
        return true;
      });
      return (
        candidatesValid &&
        project.clips.length < MAX_PROJECT_CLIPS &&
        project.clips.length - action.candidates.length + replacementClipCount <= MAX_PROJECT_CLIPS
      );
    }
    case "semanticRange.add": {
      if (project.semanticRanges.length >= MAX_SEMANTIC_RANGES) return false;
      const range: SemanticRange = {
        ...action.range,
        id: "draft-range",
        createdAt: "draft",
        updatedAt: "draft",
      };
      return (
        (range.createdBy === "user" || range.createdBy === "ai") &&
        Array.isArray(range.tags) &&
        range.tags.length <= 20 &&
        range.tags.every((tag) => typeof tag === "string" && tag.trim().length > 0 && tag.length <= 64) &&
        validateSemanticRangeInProject(project, range)
      );
    }
    case "semanticRange.update": {
      const existing = project.semanticRanges.find((range) => range.id === action.rangeId);
      if (
        !existing ||
        !action.updates ||
        typeof action.updates !== "object" ||
        Array.isArray(action.updates)
      ) {
        return false;
      }
      const updates = action.updates as Record<string, unknown>;
      const allowedKeys = ["title", "description", "tags", "sourceAnchors"];
      if (
        Object.keys(updates).length === 0 ||
        Object.keys(updates).some((key) => !allowedKeys.includes(key))
      ) return false;
      if (
        (Object.prototype.hasOwnProperty.call(updates, "title") && typeof updates.title !== "string") ||
        (Object.prototype.hasOwnProperty.call(updates, "description") && typeof updates.description !== "string") ||
        (Object.prototype.hasOwnProperty.call(updates, "tags") && !Array.isArray(updates.tags)) ||
        (Object.prototype.hasOwnProperty.call(updates, "sourceAnchors") && !Array.isArray(updates.sourceAnchors))
      ) {
        return false;
      }
      const range: SemanticRange = {
        ...existing,
        title: Object.prototype.hasOwnProperty.call(updates, "title")
          ? updates.title as string
          : existing.title,
        description: Object.prototype.hasOwnProperty.call(updates, "description")
          ? updates.description as string
          : existing.description,
        tags: Object.prototype.hasOwnProperty.call(updates, "tags")
          ? updates.tags as string[]
          : existing.tags,
        sourceAnchors: Object.prototype.hasOwnProperty.call(updates, "sourceAnchors")
          ? updates.sourceAnchors as SemanticRange["sourceAnchors"]
          : existing.sourceAnchors,
      };
      return validateSemanticRangeInProject(project, range);
    }
    case "semanticRange.delete":
      return project.semanticRanges.some((range) => range.id === action.rangeId);
  }
}

export interface EditorActionHandlers {
  addVideo: (asset: VideoAssetInput) => void;
  split: (clipId: string, timelineTime: number) => void;
  trim: (clipId: string, sourceStart: number, sourceEnd: number) => void;
  move: (clipId: string, destinationIndex: number) => void;
  duplicate: (clipId: string) => void;
  delete: (clipId: string) => void;
  speed: (clipId: string, speed: number) => void;
  applyCandidates: (candidates: SilenceCandidates) => void;
  undo: () => void;
  redo: () => void;
}
