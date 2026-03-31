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
  SilenceSegment,
  VideoMetadata,
} from "../types";

type SideTab = "media" | "files" | "settings";

interface ProjectState {
  currentView: AppView;
  setView: (view: AppView) => void;
  activeSideTab: SideTab;
  setActiveSideTab: (tab: SideTab) => void;

  filePath: string | null;
  videoMetadata: VideoMetadata | null;
  processedFilePath: string | null;
  previewFilePath: string | null;
  setFilePath: (path: string | null) => void;
  setVideoMetadata: (metadata: VideoMetadata | null) => void;
  setProcessedFilePath: (path: string | null) => void;
  setPreviewFilePath: (path: string | null) => void;

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

  progress: ProcessingProgress;
  setProgress: (progress: ProcessingProgress) => void;

  detectionSettings: DetectionSettings;
  updateDetectionSettings: (settings: Partial<DetectionSettings>) => void;

  exportSettings: ExportSettings;
  updateExportSettings: (settings: Partial<ExportSettings>) => void;

  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;

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

  filePath: null,
  videoMetadata: null,
  processedFilePath: null,
  previewFilePath: null,
  setFilePath: (path) => set({ filePath: path }),
  setVideoMetadata: (metadata) => set({ videoMetadata: metadata }),
  setProcessedFilePath: (path) => set({ processedFilePath: path }),
  setPreviewFilePath: (path) => set({ previewFilePath: path }),

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
      };
    }),

  removedSegments: [],
  setRemovedSegments: (segments) => set({ removedSegments: segments }),

  clipSegments: [],
  setClipSegments: (segments) =>
    set(() => ({
      clipSegments: segments,
      selectedClipId: segments[0]?.id ?? null,
    })),
  applySuggestedCuts: () =>
    set((state) => {
      const duration =
        state.detectionResult?.original_duration ?? state.videoMetadata?.duration ?? 0;
      const clips = buildClipSegmentsFromSilence(state.removedSegments, duration);
      return {
        clipSegments: clips,
        selectedClipId: clips[0]?.id ?? null,
      };
    }),
  removeClipSegment: (clipId) =>
    set((state) => {
      const duration = state.videoMetadata?.duration ?? 0;
      const clips = removeClipById(state.clipSegments, clipId);
      return {
        clipSegments: clips,
        removedSegments: buildSilenceSegmentsFromClips(clips, duration),
        selectedClipId: clips[0]?.id ?? null,
      };
    }),
  splitClipAtTime: (clipId, time) =>
    set((state) => {
      const duration = state.videoMetadata?.duration ?? 0;
      const clips = splitClipByTime(state.clipSegments, clipId, time);
      return {
        clipSegments: clips,
        removedSegments: buildSilenceSegmentsFromClips(clips, duration),
        selectedClipId: clips.find((clip) => time >= clip.start && time <= clip.end)?.id ?? clips[0]?.id ?? null,
      };
    }),
  selectedClipId: null,
  setSelectedClipId: (clipId) => set({ selectedClipId: clipId }),
  timelineZoom: 10,
  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.min(40, Math.max(4, zoom)) }),

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

  resetProject: () =>
    set({
      currentView: "import",
      activeSideTab: "media",
      filePath: null,
      videoMetadata: null,
      processedFilePath: null,
      previewFilePath: null,
      detectionResult: null,
      removedSegments: [],
      clipSegments: [],
      selectedClipId: null,
      timelineZoom: 10,
      progress: defaultProgress,
      detectionSettings: defaultDetectionSettings,
      exportSettings: defaultExportSettings,
      showExportModal: false,
    }),
}));
