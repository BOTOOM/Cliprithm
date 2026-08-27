import type { PreviewMode, PreviewWindow } from "../../types";

export const AUTO_PREVIEW_MAX_DURATION = 5 * 60;
export const MANUAL_PREVIEW_WINDOW_DURATION = 30;
export const PREVIEW_SEEK_EPSILON = 0.05;

export function isAutoPreviewEligible(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && duration <= AUTO_PREVIEW_MAX_DURATION;
}

export function previewWindowForTimeline(duration: number, center: number): PreviewWindow | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (isAutoPreviewEligible(duration)) return { start: 0, end: duration };

  const windowDuration = Math.min(MANUAL_PREVIEW_WINDOW_DURATION, duration);
  const boundedCenter = Number.isFinite(center) ? Math.max(0, Math.min(duration, center)) : 0;
  const start = Math.min(
    Math.max(0, duration - windowDuration),
    Math.max(0, boundedCenter - windowDuration / 2),
  );
  return { start, end: Math.min(duration, start + windowDuration) };
}

export function isTimeWithinPreviewWindow(
  time: number,
  window: PreviewWindow | null,
  epsilon = PREVIEW_SEEK_EPSILON,
): boolean {
  return Boolean(
    window &&
      Number.isFinite(time) &&
      time >= window.start - epsilon &&
      time <= window.end + epsilon,
  );
}

export function previewLocalTime(
  timelineTime: number,
  window: PreviewWindow | null,
): number | null {
  if (!window || !Number.isFinite(timelineTime)) return null;
  return Math.max(0, Math.min(window.end - window.start, timelineTime - window.start));
}

export function previewRequestFingerprint(value: unknown): string {
  return stableHash(JSON.stringify(value));
}

export function previewWindowFromPath(path: string | null): PreviewWindow | null {
  const match = path?.match(/-window-(\d+)-(\d+)-[a-f0-9]+\.mp4$/i);
  if (!match) return null;
  const start = Number(match[1]) / 1000;
  const end = Number(match[2]) / 1000;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function shouldShowEditedPreview(mode: PreviewMode, editedPath: string | null): boolean {
  return mode === "edited" && Boolean(editedPath);
}

export function persistedPreviewMode(mode: PreviewMode, editedPath: string | null): PreviewMode {
  return shouldShowEditedPreview(mode, editedPath) ? "edited" : "source";
}

export function hasEditedPreviewAvailable(
  editedPath: string | null,
  pending: boolean,
  externalPending: boolean,
): boolean {
  return Boolean(editedPath) || pending || externalPending;
}

export function isPathWithinDirectory(root: string, candidate: string): boolean {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedCandidate = candidate.replace(/\\/g, "/");
  const isWindowsPath = (value: string) => /^[A-Za-z]:\//.test(value);
  const comparisonRoot = isWindowsPath(normalizedRoot)
    ? normalizedRoot.toLowerCase()
    : normalizedRoot;
  const comparisonCandidate = isWindowsPath(normalizedCandidate)
    ? normalizedCandidate.toLowerCase()
    : normalizedCandidate;
  const prefix = `${comparisonRoot}/`;
  if (!comparisonCandidate.startsWith(prefix)) return false;
  return comparisonCandidate
    .slice(prefix.length)
    .split("/")
    .every((component) => component.length > 0 && component !== "." && component !== "..");
}

export function isOwnedEditedPreviewPath(appDataDirectory: string, candidate: string): boolean {
  if (!candidate.toLowerCase().endsWith(".mp4")) return false;
  return ["previews", "mcp-outputs"].some((directory) =>
    isPathWithinDirectory(`${appDataDirectory}/${directory}`, candidate),
  );
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
