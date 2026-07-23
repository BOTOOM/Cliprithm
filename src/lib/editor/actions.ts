import type { MediaAsset, SilenceSegment, TimelineProject } from "../../types";
import {
  MAX_CLIP_SPEED,
  MAX_PROJECT_ASSETS,
  MAX_PROJECT_CLIPS,
  MIN_CLIP_SPEED,
  getClip,
  getPositionedClips,
} from "./timeline";

type VideoAssetInput = Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>;
type SilenceCandidates = Array<{ clipId: string; segments: SilenceSegment[] }>;

export type EditorAction =
  | { type: "asset.addVideo"; asset: VideoAssetInput }
  | { type: "selection.selectClip"; clipId: string | null }
  | { type: "selection.setPlayhead"; timelineTime: number }
  | { type: "clip.splitAtPlayhead"; clipId: string; timelineTime: number }
  | { type: "clip.trim"; clipId: string; sourceStart: number; sourceEnd: number }
  | { type: "clip.move"; clipId: string; destinationIndex: number }
  | { type: "clip.duplicate"; clipId: string }
  | { type: "clip.delete"; clipId: string }
  | { type: "clip.setSpeed"; clipId: string; speed: number }
  | {
      type: "analysis.acceptCandidate";
      projectRevision: number;
      candidates: SilenceCandidates;
    }
  | { type: "history.undo" }
  | { type: "history.redo" };

export type EditorActionCategory = "media" | "selection" | "edit" | "timing" | "analysis" | "history";
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
  "analysis.acceptCandidate": projectAction({
    id: "analysis.acceptCandidate",
    category: "analysis",
    labelKey: "editor.applyCandidate",
    inputSchema: "clipId[] + silence segments[]",
    preconditions: ["candidate matches current project revision"],
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

function isValidSilenceSegment(segment: SilenceSegment): boolean {
  return (
    isFiniteNumber(segment.start) &&
    isFiniteNumber(segment.end) &&
    isFiniteNumber(segment.duration) &&
    segment.start >= 0 &&
    segment.end > segment.start &&
    segment.duration >= 0
  );
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
    case "clip.splitAtPlayhead": {
      const clip = getClip(project, action.clipId);
      const positioned = getPositionedClips(project).find(
        (candidate) => candidate.id === action.clipId
      );
      return Boolean(
        clip &&
          positioned &&
          isFiniteNumber(action.timelineTime) &&
          action.timelineTime > positioned.timelineStart + 0.08 &&
          action.timelineTime < positioned.timelineEnd - 0.08 &&
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
    case "analysis.acceptCandidate":
      return (
        Number.isInteger(action.projectRevision) &&
        action.projectRevision === project.revision &&
        action.candidates.length > 0 &&
        action.candidates.every(
          (candidate) =>
            getClip(project, candidate.clipId) !== null &&
            candidate.segments.length > 0 &&
            candidate.segments.every(isValidSilenceSegment)
        )
      );
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
