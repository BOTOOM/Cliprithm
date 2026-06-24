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

export interface PreviewSegment {
  start: number;
  end: number;
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

export interface FfmpegStatus {
  available: boolean;
  source: "bundled" | "system" | "missing";
  platform: "windows" | "macos" | "linux";
  ffmpeg_path: string | null;
  ffprobe_path: string | null;
  version: string | null;
  error: string | null;
}

export interface ExportOptions {
  input_path: string;
  output_path: string;
  segments_to_keep: [number, number][];
  resolution: string | null;
  target_width?: number | null;
  target_height?: number | null;
  sizing_mode?: ExportSizingMode | null;
  resize_mode?: ExportResizeMode | null;
  fps: number | null;
  mode: string;
  speed_multiplier: number | null;
  playback_rate: number | null;
}

export type ExportSizingMode = "preset" | "custom" | "original";

export type ExportResizeMode = "original" | "fit" | "crop" | "stretch";

export interface DetectionSettings {
  noiseThreshold: number;
  minDuration: number;
  mode: "cut" | "speed";
  speedMultiplier: number;
  fadeEnabled: boolean;
  detectBreath: boolean;
  playbackRate: number;
}

export interface ExportSettings {
  preset: "tiktok" | "reels" | "youtube" | "square" | "custom";
  fileName: string;
  resolution: "1080p" | "4k";
  width: number;
  height: number;
  sizingMode: ExportSizingMode;
  resizeMode: ExportResizeMode;
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
