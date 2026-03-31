export type AppView = "import" | "processing" | "detection" | "editor" | "export";
export type PreviewMode = "source" | "edited";

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  file_size: number;
  has_audio: boolean;
}

export interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
}

export interface ClipSegment {
  id: string;
  label: string;
  start: number;
  end: number;
  duration: number;
}

export interface DetectionResult {
  segments: SilenceSegment[];
  total_silence_duration: number;
  original_duration: number;
  estimated_output_duration: number;
}

export interface ProcessingProgress {
  percent: number;
  stage: string;
  message: string;
}

export interface ExportOptions {
  input_path: string;
  output_path: string;
  segments_to_keep: [number, number][];
  resolution: string | null;
  fps: number | null;
  mode: string;
  speed_multiplier: number | null;
}

export interface DetectionSettings {
  noiseThreshold: number;
  minDuration: number;
  mode: "cut" | "speed";
  speedMultiplier: number;
  fadeEnabled: boolean;
  detectBreath: boolean;
}

export interface ExportSettings {
  preset: "tiktok" | "reels" | "custom";
  fileName: string;
  resolution: "1080p" | "4k";
  fps: 30 | 60;
}

export type CaptionProvider =
  | "openrouter"
  | "cerebras"
  | "groq"
  | "ollama"
  | "lmstudio";

export interface CaptionSettings {
  enabled: boolean;
  provider: CaptionProvider;
  apiKey: string;
  model: string;
  burnIn: boolean;
}
