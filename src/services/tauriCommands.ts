import { invoke } from "@tauri-apps/api/core";
import { log } from "../lib/logger";
import { assertDesktop } from "../lib/runtime";
import type { DistributionContext } from "../types/distribution";
import type {
  DetectionResult,
  ExportOptions,
  FfmpegStatus,
  PreviewSegment,
  VideoMetadata,
} from "../types";

export async function checkFFmpeg(): Promise<FfmpegStatus> {
  assertDesktop("FFmpeg");
  log.debug("[ffmpeg]", "Checking FFmpeg availability...");
  const result = await invoke<FfmpegStatus>("check_ffmpeg");
  if (result.available) {
    log.info(
      "[ffmpeg]",
      `FFmpeg OK (${result.source}) ${result.version ?? "unknown version"}`
    );
  } else {
    log.warn("[ffmpeg]", result.error ?? "FFmpeg unavailable");
  }
  return result;
}

export async function getFFmpegStatus(): Promise<FfmpegStatus> {
  assertDesktop("FFmpeg");
  return checkFFmpeg();
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  assertDesktop("Video metadata reading");
  log.debug("[ffmpeg]", "Getting metadata for:", filePath);
  const meta = await invoke<VideoMetadata>("get_video_metadata", { filePath });
  log.info(
    "[ffmpeg]",
    `Metadata: ${meta.width}x${meta.height} | ${meta.duration.toFixed(1)}s | ${meta.codec}`
  );
  return meta;
}

export async function detectSilence(
  filePath: string,
  noiseThreshold: number,
  minDuration: number
): Promise<DetectionResult> {
  assertDesktop("Silence detection");
  log.info(
    "[silence]",
    `Detecting silence — threshold:${noiseThreshold}dB minDur:${minDuration}s`
  );
  const result = await invoke<DetectionResult>("detect_silence", {
    filePath,
    noiseThreshold,
    minDuration,
  });
  log.info(
    "[silence]",
    `Found ${result.segments.length} segments | silence:${result.total_silence_duration.toFixed(
      1
    )}s | estimated output:${result.estimated_output_duration.toFixed(1)}s`
  );
  return result;
}

export async function exportVideo(options: ExportOptions): Promise<string> {
  assertDesktop("Export");
  log.info(
    "[export]",
    `Exporting → ${options.output_path} | clips:${options.segments_to_keep.length}`
  );
  const result = await invoke<string>("export_video", { options });
  log.info("[export]", "Export complete:", result);
  return result;
}

export async function generateExportPreview(options: {
  inputPath: string;
  outputPath: string;
  segmentsToKeep: PreviewSegment[];
  targetWidth?: number | null;
  targetHeight?: number | null;
  resizeMode?: "original" | "fit" | "crop" | "stretch" | null;
}): Promise<string> {
  assertDesktop("Export preview generation");
  log.info("[export-preview]", `Generating still preview → ${options.outputPath}`);
  const result = await invoke<string>("generate_export_preview", {
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    segmentsToKeep: options.segmentsToKeep,
    targetWidth: options.targetWidth ?? null,
    targetHeight: options.targetHeight ?? null,
    resizeMode: options.resizeMode ?? null,
  });
  log.info("[export-preview]", "Still preview ready:", result);
  return result;
}

export async function generatePreviewProxy(
  videoPath: string,
  outputPath: string
): Promise<string> {
  assertDesktop("Preview proxy generation");
  log.info("[preview]", `Generating preview proxy → ${outputPath}`);
  const result = await invoke<string>("generate_preview_proxy", {
    videoPath,
    outputPath,
  });
  log.info("[preview]", "Preview proxy ready:", result);
  return result;
}

export async function generateEditedSequencePreview(
  inputPath: string,
  outputPath: string,
  segmentsToKeep: Array<{ start: number; end: number }>
): Promise<string> {
  assertDesktop("Edited preview generation");
  log.info(
    "[preview]",
    `Generating edited sequence preview → ${outputPath} | clips:${segmentsToKeep.length}`
  );
  const result = await invoke<string>("generate_sequence_preview", {
    inputPath,
    outputPath,
    segmentsToKeep,
  });
  log.info("[preview]", "Edited sequence preview ready:", result);
  return result;
}

export async function getMediaServerPort(): Promise<number> {
  assertDesktop("Media server");
  return invoke<number>("get_media_server_port");
}

export async function getDistributionContext(): Promise<DistributionContext> {
  assertDesktop("Distribution context");
  return invoke<DistributionContext>("get_distribution_context");
}
