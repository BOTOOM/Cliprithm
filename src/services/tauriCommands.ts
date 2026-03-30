import { invoke } from "@tauri-apps/api/core";
import type {
  VideoMetadata,
  DetectionResult,
  SilenceSegment,
} from "../types";

export async function checkFFmpeg(): Promise<string> {
  return invoke<string>("check_ffmpeg");
}

export async function getVideoMetadata(
  filePath: string
): Promise<VideoMetadata> {
  return invoke<VideoMetadata>("get_video_metadata", { filePath });
}

export async function detectSilence(
  filePath: string,
  noiseThreshold: number,
  minDuration: number
): Promise<DetectionResult> {
  return invoke<DetectionResult>("detect_silence", {
    filePath,
    noiseThreshold,
    minDuration,
  });
}

export async function cutSilence(
  filePath: string,
  segmentsToRemove: SilenceSegment[],
  outputPath: string,
  mode: string,
  speedMultiplier?: number
): Promise<string> {
  return invoke<string>("cut_silence", {
    filePath,
    segmentsToRemove,
    outputPath,
    mode,
    speedMultiplier,
  });
}

export async function exportVideo(options: {
  input_path: string;
  output_path: string;
  segments_to_keep: [number, number][];
  resolution: string | null;
  fps: number | null;
  mode: string;
  speed_multiplier: number | null;
}): Promise<string> {
  return invoke<string>("export_video", { options });
}
