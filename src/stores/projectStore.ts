import { create } from "zustand";
import {
  buildClipSegmentsFromSilence,
  buildSilenceSegmentsFromClips,
  splitClipByTime,
  removeClipById,
} from "../lib/editor";
import type {
  AppView,
  ClipSegment,
  DetectionResult,
  DetectionSettings,
  ExportSettings,
  ProcessingProgress,
  PreviewMode,
  SilenceSegment,
  VideoMetadata,
} from "../types";

type SideTab = "media" | "files" | "settings";

interface ClipHistoryEntry {
  clipSegments: ClipSegment[];
  removedSegments: SilenceSegment[];
  selectedClipId: string | null;
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
  setMediaServerPort: (port: number) => void;

  filePath: string | null;
  videoMetadata: VideoMetadata | null;
  processedFilePath: string | null;
  previewFilePath: string | null;
  editedPreviewFilePath: string | null;
  previewMode: PreviewMode;
  setFilePath: (path: string | null) => void;
  setVideoMetadata: (metadata: VideoMetadata | null) => void;
  setProcessedFilePath: (path: string | null) => void;
  setPreviewFilePath: (path: string | null) => void;
  setEditedPreviewFilePath: (path: string | null) => void;
  setPreviewMode: (mode: PreviewMode) => void;

  detectionResult: DetectionResult | null;
  setDetectionResult: (result: DetectionResult | null) => void;

  removedSegments: SilenceSegment[];
  setRemovedSegments: (segments: SilenceSegment[]) => void;

  clipSegments: ClipSegment[];
  setClipSegments: (segments: ClipSegment[]) => void;
  applySuggestedCuts: () => void;
  removeClipSegment: (clipId: string) => void;
  splitClipAtTime: (clipId: string, time: number) => void;
  selectedClipId: string | null;
  setSelectedClipId: (clipId: string | null) => void;
  timelineZoom: number;
  setTimelineZoom: (zoom: number) => void;
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
    currentView: AppView;
    previewMode: PreviewMode;
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
};

const defaultExportSettings: ExportSettings = {
  preset: "custom",
  fileName: "output",
  resolution: "1080p",
  fps: 30,
};

const defaultProgress: ProcessingProgress = {
  percent: 0,
  stage: "idle",
  message: "",
};

export const useProjectStore = create<ProjectState>((set) => ({
  currentView: "import",
  setView: (view) => set({ currentView: view }),
  activeSideTab: "media",
  setActiveSideTab: (tab) => set({ activeSideTab: tab }),

  projectId: null,
  setProjectId: (id) => set({ projectId: id }),

  mediaServerPort: 0,
  setMediaServerPort: (port) => set({ mediaServerPort: port }),

  filePath: null,
  videoMetadata: null,
  processedFilePath: null,
  previewFilePath: null,
  editedPreviewFilePath: null,
  previewMode: "source",
  setFilePath: (path) =>
    set({
      filePath: path,
      previewFilePath: null,
      editedPreviewFilePath: null,
      previewMode: "source",
    }),
  setVideoMetadata: (metadata) => set({ videoMetadata: metadata }),
  setProcessedFilePath: (path) => set({ processedFilePath: path }),
  setPreviewFilePath: (path) => set({ previewFilePath: path }),
  setEditedPreviewFilePath: (path) => set({ editedPreviewFilePath: path }),
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
          removedSegments: result?.segments ?? [],
          clipSegments,
          selectedClipId: clipSegments[0]?.id ?? null,
          editedPreviewFilePath: null,
          previewMode: "source",
          editHistory: [],
          canUndo: false,
        };
      }),

  removedSegments: [],
  setRemovedSegments: (segments) => set({ removedSegments: segments }),

  clipSegments: [],
  setClipSegments: (segments) =>
    set(() => ({
      clipSegments: segments,
      selectedClipId: segments[0]?.id ?? null,
      editedPreviewFilePath: null,
      editHistory: [],
      canUndo: false,
    })),
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
  setSelectedClipId: (clipId) => set({ selectedClipId: clipId }),
  timelineZoom: 10,
  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.min(40, Math.max(4, zoom)) }),
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
      detectionSettings: opts.detectionSettings,
      clipSegments: opts.clipSegments,
      removedSegments: opts.removedSegments,
      selectedClipId: opts.clipSegments[0]?.id ?? null,
      currentView: opts.currentView,
      previewMode: opts.previewMode,
      processedFilePath: opts.processedPath,
      previewFilePath: null,
      editedPreviewFilePath: null,
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
      previewMode: "source",
      detectionResult: null,
      removedSegments: [],
      clipSegments: [],
      selectedClipId: null,
      timelineZoom: 10,
      editHistory: [],
      canUndo: false,
      progress: defaultProgress,
      detectionSettings: defaultDetectionSettings,
      exportSettings: defaultExportSettings,
      showExportModal: false,
    }),
}));
