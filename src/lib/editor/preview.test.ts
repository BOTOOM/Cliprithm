import { describe, expect, it } from "vitest";
import {
  AUTO_PREVIEW_MAX_DURATION,
  hasEditedPreviewAvailable,
  isAutoPreviewEligible,
  isOwnedEditedPreviewPath,
  isPathWithinDirectory,
  isTimeWithinPreviewWindow,
  persistedPreviewMode,
  previewLocalTime,
  previewRequestFingerprint,
  previewWindowForTimeline,
  previewWindowFromPath,
  shouldShowEditedPreview,
  stableHash,
} from "./preview";

describe("preview window policy", () => {
  it("allows automatic previews up to the edited five-minute limit", () => {
    expect(isAutoPreviewEligible(0)).toBe(false);
    expect(isAutoPreviewEligible(AUTO_PREVIEW_MAX_DURATION)).toBe(true);
    expect(isAutoPreviewEligible(AUTO_PREVIEW_MAX_DURATION + 0.01)).toBe(false);
  });

  it("uses the complete timeline for eligible previews", () => {
    expect(previewWindowForTimeline(120, 60)).toEqual({ start: 0, end: 120 });
  });

  it("centers long preview windows around the requested time", () => {
    expect(previewWindowForTimeline(600, 300)).toEqual({ start: 285, end: 315 });
    expect(previewWindowForTimeline(600, 5)).toEqual({ start: 0, end: 30 });
    expect(previewWindowForTimeline(600, 599)).toEqual({ start: 570, end: 600 });
  });

  it("maps seeks into local preview time without exceeding the window", () => {
    const window = { start: 20, end: 50 };
    expect(isTimeWithinPreviewWindow(20, window)).toBe(true);
    expect(isTimeWithinPreviewWindow(50.04, window)).toBe(true);
    expect(isTimeWithinPreviewWindow(50.2, window)).toBe(false);
    expect(previewLocalTime(35, window)).toBe(15);
    expect(previewLocalTime(10, window)).toBe(0);
    expect(previewLocalTime(60, window)).toBe(30);
  });

  it("creates deterministic request fingerprints", () => {
    expect(previewRequestFingerprint({ revision: 2, clips: ["a"] })).toBe(
      previewRequestFingerprint({ revision: 2, clips: ["a"] }),
    );
  });
});

describe("preview mode", () => {
  it("only shows an edited file when edited mode is selected", () => {
    expect(shouldShowEditedPreview("edited", "/tmp/preview.mp4")).toBe(true);
    expect(shouldShowEditedPreview("source", "/tmp/preview.mp4")).toBe(false);
    expect(shouldShowEditedPreview("edited", null)).toBe(false);
  });

  it("allows edited preview selection while a preview is pending", () => {
    expect(hasEditedPreviewAvailable(null, true, false)).toBe(true);
    expect(hasEditedPreviewAvailable(null, false, true)).toBe(true);
    expect(hasEditedPreviewAvailable(null, false, false)).toBe(false);
  });

  it("persists source mode when no edited artifact is available", () => {
    expect(persistedPreviewMode("edited", null)).toBe("source");
    expect(persistedPreviewMode("edited", "/tmp/preview.mp4")).toBe("edited");
    expect(persistedPreviewMode("source", "/tmp/preview.mp4")).toBe("source");
  });

  it("uses legacy filename windows only as a compatibility fallback", () => {
    expect(previewWindowFromPath(
      "/app/previews/project-1-window-1250-4250-abcdef12.mp4",
    )).toEqual({ start: 1.25, end: 4.25 });
    expect(previewWindowFromPath("/app/mcp-outputs/custom-name.mp4")).toBeNull();
  });

  it("only treats preview files in app-owned directories as deletable artifacts", () => {
    const appDataDirectory = "/home/user/.local/share/cliprithm";
    expect(isOwnedEditedPreviewPath(
      appDataDirectory,
      `${appDataDirectory}/previews/project-1.mp4`,
    )).toBe(true);
    expect(isOwnedEditedPreviewPath(
      appDataDirectory,
      `${appDataDirectory}/mcp-outputs/project-1.mp4`,
    )).toBe(true);
    expect(isOwnedEditedPreviewPath(
      appDataDirectory,
      `${appDataDirectory}/previews/project-1.mov`,
    )).toBe(false);
    expect(isOwnedEditedPreviewPath(
      appDataDirectory,
      `${appDataDirectory}/../secrets.mp4`,
    )).toBe(false);
    expect(isPathWithinDirectory(
      `${appDataDirectory}/previews`,
      `${appDataDirectory}/previews-evil/project-1.mp4`,
    )).toBe(false);
  });
});

describe("preview cache keys", () => {
  it("changes when a source fingerprint changes", () => {
    expect(stableHash("asset-1:size:100:mtime:1")).not.toBe(
      stableHash("asset-1:size:100:mtime:2")
    );
  });

  it("is deterministic for equivalent input", () => {
    expect(stableHash("project:7|revision:3|source:a")).toBe(
      stableHash("project:7|revision:3|source:a")
    );
  });
});
