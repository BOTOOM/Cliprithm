import { isTauri } from "@tauri-apps/api/core";

export function isDesktopRuntime(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}

export function guessRuntimePlatform(): "windows" | "macos" | "linux" {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }

  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "macos";
  }

  return "linux";
}

export function assertDesktop(feature: string): void {
  if (!isDesktopRuntime()) {
    throw new Error(`${feature} is only available in the Cliprithm desktop app.`);
  }
}
