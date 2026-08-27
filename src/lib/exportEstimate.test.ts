import { describe, expect, it } from "vitest";
import { estimateExportSize, estimateStreamCopySize } from "./exportEstimate";

describe("initial export size estimate", () => {
  it("uses edited duration and output settings instead of source file size", () => {
    const short = estimateExportSize({
      durationSeconds: 29,
      targetWidth: 1920,
      targetHeight: 1080,
      fps: 30,
      profile: "quality",
      hasAudio: true,
    });
    const long = estimateExportSize({
      durationSeconds: 150,
      targetWidth: 1920,
      targetHeight: 1080,
      fps: 30,
      profile: "quality",
      hasAudio: true,
    });

    expect(short.method).toBe("formula");
    expect(short.expected_bytes).toBeLessThan(100 * 1024 * 1024);
    expect(long.expected_bytes).toBeGreaterThan(short.expected_bytes);
  });

  it("estimates stream-copy output from the retained duration", () => {
    expect(estimateStreamCopySize(21_300_000, 29, 29)?.expected_bytes).toBe(21_300_000);
    expect(estimateStreamCopySize(21_300_000, 29, 14.5)?.expected_bytes).toBe(10_650_000);
    expect(estimateStreamCopySize(0, 29, 14.5)).toBeNull();
  });

  it("reacts to profile, frame rate, dimensions and audio", () => {
    const fast = estimateExportSize({
      durationSeconds: 60,
      targetWidth: 1280,
      targetHeight: 720,
      fps: 30,
      profile: "fast",
      hasAudio: false,
    });
    const quality = estimateExportSize({
      durationSeconds: 60,
      targetWidth: 1920,
      targetHeight: 1080,
      fps: 60,
      profile: "quality",
      hasAudio: true,
    });

    expect(quality.expected_bytes).toBeGreaterThan(fast.expected_bytes);
    expect(quality.upper_bytes).toBeGreaterThan(quality.expected_bytes);
    expect(quality.lower_bytes).toBeLessThan(quality.expected_bytes);
  });
});
