import { describe, expect, it } from "vitest";
import {
  hasEditedPreviewAvailable,
  isOwnedEditedPreviewPath,
  isPathWithinDirectory,
  persistedPreviewMode,
  previewWindowFromPath,
  shouldShowEditedPreview,
  stableHash,
} from "./preview";

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
