import type { ExportProfile, ExportSizeEstimate } from "../types";

interface InitialEstimateInput {
  durationSeconds: number;
  targetWidth: number;
  targetHeight: number;
  fps: number;
  profile: ExportProfile;
  hasAudio: boolean;
}

const PROFILE_BITS_PER_PIXEL_FRAME: Record<ExportProfile, number> = {
  fast: 0.018,
  balanced: 0.026,
  quality: 0.038,
};

function toBytes(value: number): number {
  return Math.max(1, Math.round(value));
}

export function estimateStreamCopySize(
  sourceBytes: number,
  sourceDurationSeconds: number,
  outputDurationSeconds: number,
): ExportSizeEstimate | null {
  if (
    !Number.isFinite(sourceBytes) ||
    !Number.isFinite(sourceDurationSeconds) ||
    !Number.isFinite(outputDurationSeconds) ||
    sourceBytes <= 0 ||
    sourceDurationSeconds <= 0 ||
    outputDurationSeconds <= 0
  ) {
    return null;
  }
  const expected = sourceBytes * Math.min(1, outputDurationSeconds / sourceDurationSeconds);
  return {
    lower_bytes: toBytes(expected * 0.9),
    expected_bytes: toBytes(expected),
    upper_bytes: toBytes(expected * 1.1),
    sampled_seconds: 0,
    method: "formula",
  };
}

export function estimateExportSize(input: InitialEstimateInput): ExportSizeEstimate {
  const duration = Number.isFinite(input.durationSeconds) ? Math.max(0, input.durationSeconds) : 0;
  const width = Number.isFinite(input.targetWidth) ? Math.max(0, input.targetWidth) : 0;
  const height = Number.isFinite(input.targetHeight) ? Math.max(0, input.targetHeight) : 0;
  const fps = Number.isFinite(input.fps) ? Math.max(1, input.fps) : 30;
  const videoBitsPerSecond = width * height * fps * PROFILE_BITS_PER_PIXEL_FRAME[input.profile];
  const audioBitsPerSecond = input.hasAudio ? 192_000 : 0;
  const expected = ((videoBitsPerSecond + audioBitsPerSecond) * duration) / 8 + 32_768;

  return {
    lower_bytes: toBytes(expected * 0.45),
    expected_bytes: toBytes(expected),
    upper_bytes: toBytes(expected * 2.4),
    sampled_seconds: 0,
    method: "formula",
  };
}

export function estimateRangeLabel(estimate: ExportSizeEstimate): { lower: number; expected: number; upper: number } {
  return {
    lower: estimate.lower_bytes,
    expected: estimate.expected_bytes,
    upper: estimate.upper_bytes,
  };
}
