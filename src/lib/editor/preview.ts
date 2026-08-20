import type { PreviewMode, PreviewWindow } from "../../types";

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
