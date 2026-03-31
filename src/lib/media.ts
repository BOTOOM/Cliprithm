import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import type { VideoMetadata } from "../types";
import { isDesktopRuntime } from "./runtime";

export function resolveMediaSrc(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return "";

  if (
    pathOrUrl.startsWith("blob:") ||
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://")
  ) {
    return pathOrUrl;
  }

  if (isDesktopRuntime()) {
    return convertFileSrc(pathOrUrl);
  }

  return pathOrUrl;
}

export function getFileName(pathOrUrl?: string | null): string {
  if (!pathOrUrl) return "Untitled";
  return pathOrUrl.split("/").pop()?.split("\\").pop() ?? "Untitled";
}

export async function createBlobVideoUrl(
  filePath: string,
  mimeType = "video/mp4"
): Promise<string> {
  const bytes = await readFile(filePath);
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export async function extractBrowserVideoMetadata(file: File): Promise<{
  url: string;
  metadata: VideoMetadata;
}> {
  const url = URL.createObjectURL(file);

  const metadata = await new Promise<VideoMetadata>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;

    video.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        fps: 30,
        codec: file.type || "browser-preview",
        file_size: file.size,
        has_audio: true,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la metadata del video en el navegador."));
    };
  });

  return { url, metadata };
}
