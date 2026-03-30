import { create } from "zustand";
import type {
  AppView,
  VideoMetadata,
  SilenceSegment,
  DetectionResult,
  DetectionSettings,
  ExportSettings,
  ProcessingProgress,
} from "../types";

interface ProjectState {
  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // Video
  filePath: string | null;
  videoMetadata: VideoMetadata | null;
  processedFilePath: string | null;
  setFilePath: (path: string) => void;
  setVideoMetadata: (metadata: VideoMetadata) => void;
  setProcessedFilePath: (path: string | null) => void;

  // Silence Detection
  detectionResult: DetectionResult | null;
  setDetectionResult: (result: DetectionResult | null) => void;

  // Manually toggled silence segments (user can restore/remove)
  removedSegments: SilenceSegment[];
  setRemovedSegments: (segments: SilenceSegment[]) => void;
  restoreSegment: (index: number) => void;

  // Processing
  progress: ProcessingProgress;
  setProgress: (progress: ProcessingProgress) => void;

  // Settings
  detectionSettings: DetectionSettings;
  updateDetectionSettings: (settings: Partial<DetectionSettings>) => void;

  exportSettings: ExportSettings;
  updateExportSettings: (settings: Partial<ExportSettings>) => void;

  // Export modal
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;

  // Reset
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

  filePath: null,
  videoMetadata: null,
  processedFilePath: null,
  setFilePath: (path) => set({ filePath: path }),
  setVideoMetadata: (metadata) => set({ videoMetadata: metadata }),
  setProcessedFilePath: (path) => set({ processedFilePath: path }),

  detectionResult: null,
  setDetectionResult: (result) =>
    set({
      detectionResult: result,
      removedSegments: result?.segments ?? [],
    }),

  removedSegments: [],
  setRemovedSegments: (segments) => set({ removedSegments: segments }),
  restoreSegment: (index) =>
    set((state) => ({
      removedSegments: state.removedSegments.filter((_, i) => i !== index),
    })),

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
      filePath: null,
      videoMetadata: null,
      processedFilePath: null,
      detectionResult: null,
      removedSegments: [],
      progress: defaultProgress,
      detectionSettings: defaultDetectionSettings,
      exportSettings: defaultExportSettings,
      showExportModal: false,
    }),
}));
