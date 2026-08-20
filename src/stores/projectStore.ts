import { create } from "zustand";
import {
  validateEditorAction,
  type EditorAction,
} from "../lib/editor/actions";
import {
  createSemanticRange,
  MAX_SEMANTIC_RANGES,
  sourceAnchorsFromTimelineSelection,
  synchronizeSemanticRangeSourceAnchors,
  validateSemanticRangeInProject,
} from "../lib/editor/semanticRanges";
import {
  buildClipSegmentsFromSilence,
  buildSilenceSegmentsFromClips,
  splitClipByTime,
  removeClipById,
} from "../lib/editor";
import {
  addVideoAsset,
  createVideoProject,
  deleteClip,
  duplicateClip,
  moveClip,
  removeVideoAsset,
  setClipSpeed,
  splitClipAtTimelineTime,
  trimClip,
  replaceClipWithSilenceCandidate,
  getTimelineDuration,
} from "../lib/editor/timeline";
import type {
  AppView,
  ClipSegment,
  DetectionResult,
  DetectionSettings,
  SilenceDetectionCandidate,
  ExportSettings,
  FfmpegStatus,
  MediaAsset,
  ProcessingProgress,
  PreviewMode,
  PreviewWindow,
  SilenceSegment,
  TimelineProject,
  TimelineSelectionRange,
  VideoMetadata,
} from "../types";

type SideTab = "media" | "files" | "settings" | "diagnostics" | "about";

interface ClipHistoryEntry {
  clipSegments: ClipSegment[];
  removedSegments: SilenceSegment[];
  selectedClipId: string | null;
}

interface TimelineHistoryEntry {
  project: TimelineProject;
  selectedClipId: string | null;
  selectedSemanticRangeId: string | null;
}

function sameClipSegments(a: ClipSegment[], b: ClipSegment[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (clip, index) =>
        clip.start === b[index]?.start &&
        clip.end === b[index]?.end &&
        clip.duration === b[index]?.duration
    )
  );
}

function pushTimelineHistory(
  state: Pick<ProjectState, "timelineProject" | "timelineUndoStack" | "timelineRedoStack" | "selectedClipId" | "selectedSemanticRangeId" | "selectedRange" | "editedPreviewFilePath" | "editedPreviewWindow" | "editedPreviewPending" | "editedPreviewJobId" | "previewMode">,
  nextProject: TimelineProject,
  nextSelectedClipId: string | null
): Pick<ProjectState, "timelineProject" | "timelineUndoStack" | "timelineRedoStack" | "selectedClipId" | "selectedSemanticRangeId" | "selectedRange" | "canUndoTimeline" | "editedPreviewFilePath" | "editedPreviewWindow" | "editedPreviewPending" | "editedPreviewJobId" | "previewMode"> {
  if (state.timelineProject === nextProject) {
    return {
      timelineProject: state.timelineProject,
      timelineUndoStack: state.timelineUndoStack,
      timelineRedoStack: state.timelineRedoStack,
      selectedClipId: state.selectedClipId,
      selectedSemanticRangeId: state.selectedSemanticRangeId,
      selectedRange: state.selectedRange,
      editedPreviewFilePath: state.editedPreviewFilePath,
      editedPreviewWindow: state.editedPreviewWindow,
      editedPreviewPending: state.editedPreviewPending,
      editedPreviewJobId: state.editedPreviewJobId,
      previewMode: state.previewMode,
      canUndoTimeline: state.timelineUndoStack.length > 0,
    };
  }

  const synchronizedProject = synchronizeSemanticRangeSourceAnchors(nextProject);
  const snapshot: TimelineHistoryEntry = {
    project: state.timelineProject as TimelineProject,
    selectedClipId: state.selectedClipId,
    selectedSemanticRangeId: state.selectedSemanticRangeId,
  };

  return {
    timelineProject: synchronizedProject,
    timelineUndoStack: [...state.timelineUndoStack, snapshot].slice(-100),
    timelineRedoStack: [],
    selectedClipId: nextSelectedClipId,
    selectedSemanticRangeId: null,
    selectedRange: null,
    editedPreviewFilePath: null,
    editedPreviewWindow: null,
    editedPreviewPending: false,
    editedPreviewJobId: null,
    previewMode: "source",
    canUndoTimeline: true,
  };
}

function pushClipHistory(
  state: Pick<ProjectState, "clipSegments" | "removedSegments" | "selectedClipId" | "editHistory">,
  nextClips: ClipSegment[],
  nextRemovedSegments: SilenceSegment[],
  nextSelectedClipId: string | null
): Pick<ProjectState, "clipSegments" | "removedSegments" | "selectedClipId" | "editHistory"> {
  if (
    sameClipSegments(state.clipSegments, nextClips) &&
    state.selectedClipId === nextSelectedClipId
  ) {
    return {
      clipSegments: state.clipSegments,
      removedSegments: state.removedSegments,
      selectedClipId: state.selectedClipId,
      editHistory: state.editHistory,
    };
  }

  const snapshot: ClipHistoryEntry = {
    clipSegments: state.clipSegments,
    removedSegments: state.removedSegments,
    selectedClipId: state.selectedClipId,
  };

  return {
    clipSegments: nextClips,
    removedSegments: nextRemovedSegments,
    selectedClipId: nextSelectedClipId,
    editHistory: [...state.editHistory, snapshot].slice(-100),
  };
}

interface ProjectState {
  currentView: AppView;
  setView: (view: AppView) => void;
  activeSideTab: SideTab;
  setActiveSideTab: (tab: SideTab) => void;

  projectId: number | null;
  setProjectId: (id: number | null) => void;

  mediaServerPort: number;
  mediaServerToken: string;
  setMediaServerPort: (port: number) => void;
  setMediaServerToken: (token: string) => void;

  ffmpegStatus: FfmpegStatus | null;
  setFfmpegStatus: (status: FfmpegStatus | null) => void;

  filePath: string | null;
  videoMetadata: VideoMetadata | null;
  processedFilePath: string | null;
  previewFilePath: string | null;
  editedPreviewFilePath: string | null;
  editedPreviewWindow: PreviewWindow | null;
  editedPreviewPending: boolean;
  editedPreviewJobId: string | null;
  previewMode: PreviewMode;
  setFilePath: (path: string | null) => void;
  setVideoMetadata: (metadata: VideoMetadata | null) => void;
  setProcessedFilePath: (path: string | null) => void;
  setPreviewFilePath: (path: string | null) => void;
  setEditedPreviewFilePath: (path: string | null) => void;
  setEditedPreviewWindow: (window: PreviewWindow | null) => void;
  setEditedPreviewPending: (pending: boolean) => void;
  setEditedPreviewJobId: (jobId: string | null) => void;
  setPreviewMode: (mode: PreviewMode) => void;

  detectionResult: DetectionResult | null;
  setDetectionResult: (result: DetectionResult | null) => void;
  silenceCandidate: SilenceDetectionCandidate | null;
  setSilenceCandidate: (candidate: SilenceDetectionCandidate | null) => void;

  removedSegments: SilenceSegment[];
  setRemovedSegments: (segments: SilenceSegment[]) => void;

  clipSegments: ClipSegment[];
  setClipSegments: (segments: ClipSegment[]) => void;
  applySuggestedCuts: () => void;
  removeClipSegment: (clipId: string) => void;
  splitClipAtTime: (clipId: string, time: number) => void;
  timelineProject: TimelineProject | null;
  setTimelineProject: (project: TimelineProject | null) => void;
  initializeTimelineProject: (asset: Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>) => void;
  addVideoToTimeline: (asset: Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">>) => void;
  removeVideoFromTimeline: (assetId: string) => void;
  splitTimelineClipAtTime: (clipId: string, timelineTime: number) => void;
  trimTimelineClip: (clipId: string, sourceStart: number, sourceEnd: number) => void;
  moveTimelineClip: (clipId: string, destinationIndex: number) => void;
  duplicateTimelineClip: (clipId: string) => void;
  deleteTimelineClip: (clipId: string) => void;
  setTimelineClipSpeed: (clipId: string, speed: number) => void;
  applyTimelineSilenceCandidate: (clipId: string, segments: SilenceSegment[]) => void;
  applyTimelineSilenceCandidates: (candidates: Array<{ clipId: string; segments: SilenceSegment[] }>) => void;
  addSemanticRange: (range: Parameters<typeof createSemanticRange>[0]) => void;
  updateSemanticRange: (
    rangeId: string,
    updates: Partial<Pick<TimelineProject["semanticRanges"][number], "title" | "description" | "tags" | "timelineStart" | "timelineEnd">>
  ) => void;
  deleteSemanticRange: (rangeId: string) => void;
  dispatchEditorAction: (action: EditorAction) => boolean;
  selectedClipId: string | null;
  setSelectedClipId: (clipId: string | null) => void;
  selectedSemanticRangeId: string | null;
  setSelectedSemanticRangeId: (rangeId: string | null) => void;
  selectedRange: TimelineSelectionRange | null;
  setSelectedRange: (range: TimelineSelectionRange | null) => void;
  playhead: number;
  setPlayhead: (timelineTime: number) => void;
  timelineZoom: number;
  setTimelineZoom: (zoom: number) => void;
  timelineUndoStack: TimelineHistoryEntry[];
  timelineRedoStack: TimelineHistoryEntry[];
  canUndoTimeline: boolean;
  undoTimeline: () => void;
  redoTimeline: () => void;
  editHistory: ClipHistoryEntry[];
  canUndo: boolean;
  undoLastEdit: () => void;

  progress: ProcessingProgress;
  setProgress: (progress: ProcessingProgress) => void;

  detectionSettings: DetectionSettings;
  updateDetectionSettings: (settings: Partial<DetectionSettings>) => void;

  exportSettings: ExportSettings;
  updateExportSettings: (settings: Partial<ExportSettings>) => void;

  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;

  loadProject: (opts: {
    projectId: number;
    filePath: string;
    videoMetadata: VideoMetadata;
    detectionResult: DetectionResult | null;
    detectionSettings: DetectionSettings;
    clipSegments: ClipSegment[];
    removedSegments: SilenceSegment[];
    timelineProject?: TimelineProject | null;
    currentView: AppView;
    previewMode: PreviewMode;
    editedPreviewPath?: string | null;
    editedPreviewWindow?: PreviewWindow | null;
    processedPath: string | null;
  }) => void;

  resetProject: () => void;
}

const defaultDetectionSettings: DetectionSettings = {
  noiseThreshold: -30,
  minDuration: 0.5,
  mode: "cut",
  speedMultiplier: 2.0,
  fadeEnabled: true,
  detectBreath: false,
  playbackRate: 1.0,
};

const defaultExportSettings: ExportSettings = {
  preset: "custom",
  fileName: "output",
  resolution: "1080p",
  width: 1920,
  height: 1080,
  sizingMode: "original",
  resizeMode: "original",
  profile: "quality",
  fps: 30,
};

const defaultProgress: ProcessingProgress = {
  percent: 0,
  stage: "idle",
  message: "",
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentView: "import",
  setView: (view) => set({ currentView: view }),
  activeSideTab: "media",
  setActiveSideTab: (tab) => set({ activeSideTab: tab }),

  projectId: null,
  setProjectId: (id) => set({ projectId: id }),

  mediaServerPort: 0,
  mediaServerToken: "",
  setMediaServerPort: (port) => set({ mediaServerPort: port }),
  setMediaServerToken: (token) => set({ mediaServerToken: token }),

  ffmpegStatus: null,
  setFfmpegStatus: (status) => set({ ffmpegStatus: status }),

  filePath: null,
  videoMetadata: null,
  processedFilePath: null,
  previewFilePath: null,
  editedPreviewFilePath: null,
  editedPreviewWindow: null,
  editedPreviewPending: false,
  editedPreviewJobId: null,
  previewMode: "source",
  setFilePath: (path) =>
    set({
      filePath: path,
      previewFilePath: null,
      editedPreviewFilePath: null,
      editedPreviewWindow: null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
      previewMode: "source",
      selectedSemanticRangeId: null,
      selectedRange: null,
    }),
  setVideoMetadata: (metadata) => set({ videoMetadata: metadata }),
  setProcessedFilePath: (path) => set({ processedFilePath: path }),
  setPreviewFilePath: (path) => set({ previewFilePath: path }),
  setEditedPreviewFilePath: (path) => set({ editedPreviewFilePath: path }),
  setEditedPreviewWindow: (window) => set({ editedPreviewWindow: window }),
  setEditedPreviewPending: (pending) =>
    set((state) => ({
      editedPreviewPending: pending,
      ...(pending || state.editedPreviewFilePath || state.editedPreviewJobId || state.previewMode !== "edited"
        ? {}
        : { previewMode: "source" as const }),
    })),
  setEditedPreviewJobId: (jobId) => set({ editedPreviewJobId: jobId }),
  setPreviewMode: (mode) => set({ previewMode: mode }),

  detectionResult: null,
  setDetectionResult: (result) =>
    set((state) => {
      const duration = result?.original_duration ?? state.videoMetadata?.duration ?? 0;
      const clipSegments = result
        ? buildClipSegmentsFromSilence(result.segments, duration)
        : [];

        return {
          detectionResult: result,
          silenceCandidate: null,
          removedSegments: result?.segments ?? [],
          clipSegments,
          selectedClipId: clipSegments[0]?.id ?? null,
          selectedRange: null,
          editedPreviewFilePath: null,
          editedPreviewWindow: null,
          editedPreviewPending: false,
          editedPreviewJobId: null,
          previewMode: "source",
          editHistory: [],
          canUndo: false,
        };
      }),
  silenceCandidate: null,
  setSilenceCandidate: (candidate) => set({ silenceCandidate: candidate }),

  removedSegments: [],
  setRemovedSegments: (segments) => set({ removedSegments: segments }),

  clipSegments: [],
  setClipSegments: (segments) =>
    set(() => ({
      clipSegments: segments,
      selectedClipId: segments[0]?.id ?? null,
      selectedRange: null,
      editedPreviewFilePath: null,
      editedPreviewWindow: null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
      previewMode: "source",
      editHistory: [],
      canUndo: false,
    })),
  timelineProject: null,
  setTimelineProject: (project) =>
    set({
      timelineProject: project,
      timelineUndoStack: [],
      timelineRedoStack: [],
      canUndoTimeline: false,
      selectedClipId: project?.tracks[0]?.clipIds[0] ?? null,
      selectedRange: null,
      editedPreviewFilePath: null,
      editedPreviewWindow: null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
      previewMode: "source",
      playhead: 0,
    }),
  initializeTimelineProject: (asset) =>
    set(() => {
      const project = createVideoProject(asset);
      return {
        timelineProject: project,
        timelineUndoStack: [],
        timelineRedoStack: [],
        canUndoTimeline: false,
        selectedClipId: project.tracks[0]?.clipIds[0] ?? null,
        selectedRange: null,
        editedPreviewFilePath: null,
        editedPreviewWindow: null,
        editedPreviewPending: false,
        editedPreviewJobId: null,
        previewMode: "source",
        playhead: 0,
      };
    }),
  addVideoToTimeline: (asset) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = addVideoAsset(state.timelineProject, asset);
      const nextClipId = project.clips[project.clips.length - 1]?.id ?? state.selectedClipId;
      return pushTimelineHistory(state, project, nextClipId);
    }),
  removeVideoFromTimeline: (assetId) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = removeVideoAsset(state.timelineProject, assetId);
      return pushTimelineHistory(state, project, state.selectedClipId);
    }),
  splitTimelineClipAtTime: (clipId, timelineTime) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const original = state.timelineProject.clips.find((clip) => clip.id === clipId);
      const project = splitClipAtTimelineTime(state.timelineProject, clipId, timelineTime);
      const selectedClip = original
        ? project.clips.find(
            (clip) =>
              clip.createdByActionId === "clip.splitAtPlayhead" &&
              clip.assetId === original.assetId &&
              clip.trackId === original.trackId &&
              clip.sourceStart === original.sourceStart &&
              clip.sourceEnd < original.sourceEnd
          )
        : undefined;
      return pushTimelineHistory(state, project, selectedClip?.id ?? state.selectedClipId);
    }),
  trimTimelineClip: (clipId, sourceStart, sourceEnd) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = trimClip(state.timelineProject, clipId, sourceStart, sourceEnd);
      return pushTimelineHistory(state, project, clipId);
    }),
  moveTimelineClip: (clipId, destinationIndex) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = moveClip(state.timelineProject, clipId, destinationIndex);
      return pushTimelineHistory(state, project, clipId);
    }),
  duplicateTimelineClip: (clipId) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = duplicateClip(state.timelineProject, clipId);
      const track = project.tracks.find((candidate) => candidate.kind === "video");
      const selected = track?.clipIds[track.clipIds.indexOf(clipId) + 1] ?? clipId;
      return pushTimelineHistory(state, project, selected);
    }),
  deleteTimelineClip: (clipId) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = deleteClip(state.timelineProject, clipId);
      const selected = project.tracks[0]?.clipIds[0] ?? null;
      return pushTimelineHistory(state, project, selected);
    }),
  setTimelineClipSpeed: (clipId, speed) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const project = setClipSpeed(state.timelineProject, clipId, speed);
      return pushTimelineHistory(state, project, clipId);
    }),
  applyTimelineSilenceCandidate: (clipId, segments) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const original = state.timelineProject.clips.find((clip) => clip.id === clipId);
      const project = replaceClipWithSilenceCandidate(
        state.timelineProject,
        clipId,
        segments
      );
      const selectedClip = original
        ? project.clips.find(
            (clip) =>
              clip.createdByActionId === "analysis.acceptCandidate" &&
              clip.assetId === original.assetId &&
              clip.trackId === original.trackId &&
              clip.sourceStart >= original.sourceStart &&
              clip.sourceEnd <= original.sourceEnd
          )
        : undefined;
      return pushTimelineHistory(state, project, selectedClip?.id ?? state.selectedClipId);
    }),
  applyTimelineSilenceCandidates: (candidates) =>
    set((state) => {
      if (!state.timelineProject || candidates.length === 0) return state;
      const originalClips = new Map(
        candidates
          .map((candidate) => [
            candidate.clipId,
            state.timelineProject?.clips.find((clip) => clip.id === candidate.clipId),
          ])
          .filter((entry): entry is [string, TimelineProject["clips"][number]] => Boolean(entry[1]))
      );
      const project = candidates.reduce(
        (current, candidate) =>
          replaceClipWithSilenceCandidate(current, candidate.clipId, candidate.segments),
        state.timelineProject
      );
      const selectedCandidate = candidates.find((candidate) => originalClips.has(candidate.clipId));
      const original = selectedCandidate && originalClips.get(selectedCandidate.clipId);
      const selectedClip = original
        ? project.clips.find(
            (clip) =>
              clip.createdByActionId === "analysis.acceptCandidate" &&
              clip.assetId === original.assetId &&
              clip.trackId === original.trackId &&
              clip.sourceStart >= original.sourceStart &&
              clip.sourceEnd <= original.sourceEnd
          )
        : undefined;
      return pushTimelineHistory(state, project, selectedClip?.id ?? state.selectedClipId);
    }),
  addSemanticRange: (range) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const sourceAnchors = typeof range.timelineStart === "number" && typeof range.timelineEnd === "number"
        ? sourceAnchorsFromTimelineSelection(state.timelineProject, range.timelineStart, range.timelineEnd)
        : range.sourceAnchors ?? [];
      const nextRange = createSemanticRange({ ...range, sourceAnchors });
      if (
        state.timelineProject.semanticRanges.length >= MAX_SEMANTIC_RANGES ||
        !validateSemanticRangeInProject(state.timelineProject, nextRange)
      ) return state;
      const project: TimelineProject = {
        ...state.timelineProject,
        semanticRanges: [...state.timelineProject.semanticRanges, nextRange],
        revision: state.timelineProject.revision + 1,
      };
      return {
        ...pushTimelineHistory(state, project, state.selectedClipId),
        selectedSemanticRangeId: nextRange.id,
      };
    }),
  updateSemanticRange: (rangeId, updates) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const existing = state.timelineProject.semanticRanges.find((range) => range.id === rangeId);
      if (!existing) return state;
      const timelineStart = updates.timelineStart ?? existing.timelineStart;
      const timelineEnd = updates.timelineEnd ?? existing.timelineEnd;
      const nextRange = {
        ...existing,
        title: updates.title ?? existing.title,
        description: updates.description ?? existing.description,
        tags: updates.tags ?? existing.tags,
        timelineStart,
        timelineEnd,
        sourceAnchors: timelineStart !== null && timelineEnd !== null
          ? sourceAnchorsFromTimelineSelection(state.timelineProject, timelineStart, timelineEnd)
          : existing.sourceAnchors,
        updatedAt: new Date().toISOString(),
      };
      if (!validateSemanticRangeInProject(state.timelineProject, nextRange)) return state;
      const project: TimelineProject = {
        ...state.timelineProject,
        semanticRanges: state.timelineProject.semanticRanges.map((range) =>
          range.id === rangeId ? nextRange : range
        ),
        revision: state.timelineProject.revision + 1,
      };
      return pushTimelineHistory(state, project, state.selectedClipId);
    }),
  deleteSemanticRange: (rangeId) =>
    set((state) => {
      if (!state.timelineProject) return state;
      const semanticRanges = state.timelineProject.semanticRanges.filter((range) => range.id !== rangeId);
      if (semanticRanges.length === state.timelineProject.semanticRanges.length) return state;
      const project: TimelineProject = {
        ...state.timelineProject,
        semanticRanges,
        revision: state.timelineProject.revision + 1,
      };
      return pushTimelineHistory(state, project, state.selectedClipId);
    }),
  dispatchEditorAction: (action) => {
    const state = get();
    if (
      !validateEditorAction(action, {
        timelineProject: state.timelineProject,
        canUndoTimeline: state.canUndoTimeline,
        canRedoTimeline: state.timelineRedoStack.length > 0,
      })
    ) {
      return false;
    }

    switch (action.type) {
      case "selection.selectClip":
        state.setSelectedClipId(action.clipId);
        break;
      case "selection.setPlayhead":
        state.setPlayhead(action.timelineTime);
        break;
      case "selection.selectRange":
        state.setSelectedRange({ start: action.start, end: action.end });
        break;
      case "selection.selectSemanticRange":
        state.setSelectedSemanticRangeId(action.rangeId);
        break;
      case "asset.addVideo":
        state.addVideoToTimeline(action.asset);
        break;
      case "asset.remove":
        state.removeVideoFromTimeline(action.assetId);
        break;
      case "clip.splitAtPlayhead":
        state.splitTimelineClipAtTime(action.clipId, action.timelineTime);
        break;
      case "clip.trim":
        state.trimTimelineClip(action.clipId, action.sourceStart, action.sourceEnd);
        break;
      case "clip.move":
        state.moveTimelineClip(action.clipId, action.destinationIndex);
        break;
      case "clip.duplicate":
        state.duplicateTimelineClip(action.clipId);
        break;
      case "clip.delete":
        state.deleteTimelineClip(action.clipId);
        break;
      case "clip.setSpeed":
        state.setTimelineClipSpeed(action.clipId, action.speed);
        break;
      case "clip.resetSpeed":
        state.setTimelineClipSpeed(action.clipId, 1);
        break;
      case "analysis.acceptCandidate":
        state.applyTimelineSilenceCandidates(action.candidates);
        break;
      case "semanticRange.add":
        state.addSemanticRange(action.range);
        break;
      case "semanticRange.update":
        state.updateSemanticRange(action.rangeId, action.updates);
        break;
      case "semanticRange.delete":
        state.deleteSemanticRange(action.rangeId);
        break;
      case "history.undo":
        state.undoTimeline();
        break;
      case "history.redo":
        state.redoTimeline();
        break;
    }
    return true;
  },
  applySuggestedCuts: () =>
    set((state) => {
      const duration =
        state.detectionResult?.original_duration ?? state.videoMetadata?.duration ?? 0;
      const clips = buildClipSegmentsFromSilence(state.removedSegments, duration);
      const nextSelectedClipId = clips[0]?.id ?? null;
      const nextState = pushClipHistory(
        state,
        clips,
        state.removedSegments,
        nextSelectedClipId
      );
      return {
        ...nextState,
        canUndo: nextState.editHistory.length > 0,
      };
    }),
  removeClipSegment: (clipId) =>
    set((state) => {
      const duration = state.videoMetadata?.duration ?? 0;
      const clips = removeClipById(state.clipSegments, clipId);
      const removedSegments = buildSilenceSegmentsFromClips(clips, duration);
      const nextSelectedClipId = clips[0]?.id ?? null;
      const nextState = pushClipHistory(
        state,
        clips,
        removedSegments,
        nextSelectedClipId
      );
      return {
        ...nextState,
        canUndo: nextState.editHistory.length > 0,
      };
    }),
  splitClipAtTime: (clipId, time) =>
    set((state) => {
      const duration = state.videoMetadata?.duration ?? 0;
      const clips = splitClipByTime(state.clipSegments, clipId, time);
      const removedSegments = buildSilenceSegmentsFromClips(clips, duration);
      const nextSelectedClipId =
        clips.find((clip) => time >= clip.start && time <= clip.end)?.id ??
        clips[0]?.id ??
        null;
      const nextState = pushClipHistory(
        state,
        clips,
        removedSegments,
        nextSelectedClipId
      );
      return {
        ...nextState,
        canUndo: nextState.editHistory.length > 0,
      };
    }),
  selectedClipId: null,
  setSelectedClipId: (clipId) => set({ selectedClipId: clipId, selectedSemanticRangeId: null }),
  selectedSemanticRangeId: null,
  setSelectedSemanticRangeId: (rangeId) => set({ selectedSemanticRangeId: rangeId }),
  selectedRange: null,
  setSelectedRange: (range) => set({ selectedRange: range }),
  playhead: 0,
  setPlayhead: (timelineTime) =>
    set((state) => {
      const duration = state.timelineProject
        ? getTimelineDuration(state.timelineProject)
        : 0;
      return { playhead: Math.max(0, Math.min(duration, timelineTime)) };
    }),
  timelineZoom: 10,
  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.min(40, Math.max(4, zoom)) }),
  timelineUndoStack: [],
  timelineRedoStack: [],
  canUndoTimeline: false,
  undoTimeline: () =>
    set((state) => {
      const previous = state.timelineUndoStack[state.timelineUndoStack.length - 1];
      if (!previous || !state.timelineProject) return state;
      return {
        timelineProject: {
          ...previous.project,
          revision: state.timelineProject.revision + 1,
        },
        timelineUndoStack: state.timelineUndoStack.slice(0, -1),
        timelineRedoStack: [
          ...state.timelineRedoStack,
          {
            project: state.timelineProject,
            selectedClipId: state.selectedClipId,
            selectedSemanticRangeId: state.selectedSemanticRangeId,
          },
        ].slice(-100),
        selectedClipId: previous.selectedClipId,
        selectedSemanticRangeId: previous.selectedSemanticRangeId,
        selectedRange: null,
        editedPreviewFilePath: null,
        editedPreviewWindow: null,
        editedPreviewPending: false,
        editedPreviewJobId: null,
        previewMode: "source",
        canUndoTimeline: state.timelineUndoStack.length > 1,
      };
    }),
  redoTimeline: () =>
    set((state) => {
      const next = state.timelineRedoStack[state.timelineRedoStack.length - 1];
      if (!next || !state.timelineProject) return state;
      return {
        timelineProject: {
          ...next.project,
          revision: state.timelineProject.revision + 1,
        },
        timelineUndoStack: [
          ...state.timelineUndoStack,
          {
            project: state.timelineProject,
            selectedClipId: state.selectedClipId,
            selectedSemanticRangeId: state.selectedSemanticRangeId,
          },
        ].slice(-100),
        timelineRedoStack: state.timelineRedoStack.slice(0, -1),
        selectedClipId: next.selectedClipId,
        selectedSemanticRangeId: next.selectedSemanticRangeId,
        selectedRange: null,
        editedPreviewFilePath: null,
        editedPreviewWindow: null,
        editedPreviewPending: false,
        editedPreviewJobId: null,
        previewMode: "source",
        canUndoTimeline: true,
      };
    }),
  editHistory: [],
  canUndo: false,
  undoLastEdit: () =>
    set((state) => {
      const previous = state.editHistory[state.editHistory.length - 1];
      if (!previous) {
        return state;
      }

      const nextHistory = state.editHistory.slice(0, -1);
      return {
        clipSegments: previous.clipSegments,
        removedSegments: previous.removedSegments,
        selectedClipId: previous.selectedClipId,
        editHistory: nextHistory,
        canUndo: nextHistory.length > 0,
      };
    }),

  progress: defaultProgress,
  setProgress: (progress) => set({ progress }),

  detectionSettings: defaultDetectionSettings,
  updateDetectionSettings: (settings) =>
    set((state) => ({
      detectionSettings: { ...state.detectionSettings, ...settings },
    })),

  exportSettings: defaultExportSettings,
  updateExportSettings: (settings) =>
    set((state) => ({
      exportSettings: { ...state.exportSettings, ...settings },
    })),

  showExportModal: false,
  setShowExportModal: (show) => set({ showExportModal: show }),

  loadProject: (opts) =>
    set({
      projectId: opts.projectId,
      filePath: opts.filePath,
      videoMetadata: opts.videoMetadata,
      detectionResult: opts.detectionResult,
      silenceCandidate: null,
      detectionSettings: opts.detectionSettings,
      clipSegments: opts.clipSegments,
      removedSegments: opts.removedSegments,
      timelineProject: opts.timelineProject ?? null,
      timelineUndoStack: [],
      timelineRedoStack: [],
      canUndoTimeline: false,
      selectedClipId:
        opts.timelineProject?.tracks[0]?.clipIds[0] ?? opts.clipSegments[0]?.id ?? null,
      selectedSemanticRangeId: null,
      selectedRange: null,
      playhead: 0,
      currentView: opts.currentView,
      previewMode: opts.previewMode === "edited" && opts.editedPreviewPath ? "edited" : "source",
      processedFilePath: opts.processedPath,
      previewFilePath: null,
      editedPreviewFilePath: opts.editedPreviewPath ?? null,
      editedPreviewWindow: opts.editedPreviewWindow ?? null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
      editHistory: [],
      canUndo: false,
      progress: defaultProgress,
      showExportModal: false,
    }),

  resetProject: () =>
    set({
      currentView: "import",
      activeSideTab: "media",
      projectId: null,
      filePath: null,
      videoMetadata: null,
      processedFilePath: null,
      previewFilePath: null,
      editedPreviewFilePath: null,
      editedPreviewWindow: null,
      editedPreviewPending: false,
      editedPreviewJobId: null,
      previewMode: "source",
      detectionResult: null,
      silenceCandidate: null,
      removedSegments: [],
      clipSegments: [],
      timelineProject: null,
      selectedClipId: null,
      selectedSemanticRangeId: null,
      selectedRange: null,
      playhead: 0,
      timelineZoom: 10,
      timelineUndoStack: [],
      timelineRedoStack: [],
      canUndoTimeline: false,
      editHistory: [],
      canUndo: false,
      progress: defaultProgress,
      detectionSettings: defaultDetectionSettings,
      exportSettings: defaultExportSettings,
      showExportModal: false,
    }),
}));
