import { invoke } from "@tauri-apps/api/core";
import { log } from "../lib/logger";
import type {
  VideoMetadata,
  DetectionResult,
  SilenceSegment,
} from "../types";

export async function checkFFmpeg(): Promise<string> {
  log.debug("[ffmpeg]", "Checking FFmpeg availability...");
  try {
    const result = await invoke<string>("check_ffmpeg");
    log.info("[ffmpeg]", "FFmpeg OK:", result);
    return result;
  } catch (e) {
    log.error("[ffmpeg]", "FFmpeg not found:", e);
    throw e;
  }
}

export async function getVideoMetadata(
  filePath: string
): Promise<VideoMetadata> {
  log.debug("[ffmpeg]", "Getting metadata for:", filePath);
  try {
    const meta = await invoke<VideoMetadata>("get_video_metadata", { filePath });
    log.info("[ffmpeg]", `Metadata: ${meta.width}x${meta.height} | ${meta.duration.toFixed(1)}s | ${meta.codec}`);
    return meta;
  } catch (e) {
    log.error("[ffmpeg]", "get_video_metadata failed:", e);
    throw e;
  }
}

export async function detectSilence(
  filePath: string,
  noiseThreshold: number,
  minDuration: number
): Promise<DetectionResult> {
  log.info("[silence]", `Detecting silence — threshold:${noiseThreshold}dB minDur:${minDuration}s`);
  try {
    const result = await invoke<DetectionResult>("detect_silence", {
      filePath,
      noiseThreshold,
      minDuration,
    });
    log.info(
      "[silence]",
      `Found ${result.segments.length} segments | silence:${result.total_silence_duration.toFixed(1)}s | estimated output:${result.estimated_output_duration.toFixed(1)}s`
    );
    return result;
  } catch (e) {
    log.error("[silence]", "detect_silence failed:", e);
    throw e;
  }
}

export async function cutSilence(
  filePath: string,
  segmentsToRemove: SilenceSegment[],
  outputPath: string,
  mode: string,
  speedMultiplier?: number
): Promise<string> {
  log.info("[cut]", `Cutting — mode:${mode} segments:${segmentsToRemove.length} output:${outputPath}`);
  try {
    const result = await invoke<string>("cut_silence", {
      filePath,
      segmentsToRemove,
      outputPath,
      mode,
      speedMultiplier,
    });
    log.info("[cut]", "Cut complete:", result);
    return result;
  } catch (e) {
    log.error("[cut]", "cut_silence failed:", e);
    throw e;
  }
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
  log.info("[export]", `Exporting → ${options.output_path} | res:${options.resolution} fps:${options.fps}`);
  try {
    const result = await invoke<string>("export_video", { options });
    log.info("[export]", "Export complete:", result);
    return result;
  } catch (e) {
    log.error("[export]", "export_video failed:", e);
    throw e;
  }
}
