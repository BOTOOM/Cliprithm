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

export type MediaAssetKind = "video" | "image" | "gif" | "audio" | "text";
export type TimelineTrackKind = "video" | "audio" | "overlay";

export interface MediaAsset {
  id: string;
  kind: MediaAssetKind;
  path: string;
  name: string;
  metadata: VideoMetadata | null;
  thumbnailPath: string | null;
  sourceFingerprint: string | null;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  sourceStart: number;
  sourceEnd: number;
  sourceBounds?: {
    start: number;
    end: number;
  };
  speed: number;
  label: string;
  createdByActionId?: string;
}

export interface TimelineTrack {
  id: string;
  kind: TimelineTrackKind;
  name: string;
  clipIds: string[];
  muted: boolean;
  locked: boolean;
  visible: boolean;
}

export interface TimelineProject {
  schemaVersion: 1;
  assets: MediaAsset[];
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  revision: number;
}

export interface SilenceDetectionCandidate {
  id: string;
  projectRevision: number;
  scope: "clip" | "timeline";
  settings: Pick<DetectionSettings, "noiseThreshold" | "minDuration" | "detectBreath">;
  ranges: Array<{ clipId: string; segments: SilenceSegment[] }>;
  estimatedOutputDuration: number;
  status: "preparing" | "analyzing" | "reviewable" | "accepted" | "discarded";
}

export interface PreviewJobState {
  jobId: string;
  projectRevision: number;
  kind: "asset_proxy" | "sequence_preview" | "preview_window" | "silence_analysis" | "export_render";
  status: "queued" | "running" | "complete" | "cancelled" | "failed";
  percent: number;
  outputPath: string | null;
  error: string | null;
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
  jobId?: string;
}

export type ExportProfile = "fast" | "balanced" | "quality";

export type HardwareAccelerationVendor = "amd" | "nvidia" | "intel" | "apple" | null;

export interface FfmpegStatus {
  available: boolean;
  source: "bundled" | "system" | "missing";
  platform: "windows" | "macos" | "linux";
  ffmpeg_path: string | null;
  ffprobe_path: string | null;
  version: string | null;
  hardware_encoder: string | null;
  hardware_vendor: HardwareAccelerationVendor;
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
  profile?: ExportProfile | null;
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
  profile: ExportProfile;
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
