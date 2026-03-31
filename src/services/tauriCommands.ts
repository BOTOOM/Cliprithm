import { invoke } from "@tauri-apps/api/core";
import { log } from "../lib/logger";
import { assertDesktop } from "../lib/runtime";
import type {
  DetectionResult,
  ExportOptions,
  VideoMetadata,
} from "../types";

export async function checkFFmpeg(): Promise<string> {
  assertDesktop("FFmpeg");
  log.debug("[ffmpeg]", "Checking FFmpeg availability...");
  const result = await invoke<string>("check_ffmpeg");
  log.info("[ffmpeg]", "FFmpeg OK:", result);
  return result;
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  assertDesktop("La lectura de metadata");
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
  assertDesktop("La detección de silencios");
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
  assertDesktop("La exportación");
  log.info(
    "[export]",
    `Exporting → ${options.output_path} | clips:${options.segments_to_keep.length}`
  );
  const result = await invoke<string>("export_video", { options });
  log.info("[export]", "Export complete:", result);
  return result;
}

export async function generatePreviewProxy(
  videoPath: string,
  outputPath: string
): Promise<string> {
  assertDesktop("La generación del proxy de preview");
  log.info("[preview]", `Generating preview proxy → ${outputPath}`);
  const result = await invoke<string>("generate_preview_proxy", {
    videoPath,
    outputPath,
  });
  log.info("[preview]", "Preview proxy ready:", result);
  return result;
}
