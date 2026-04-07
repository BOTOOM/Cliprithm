import { openUrl as tauriOpenUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { isDesktopRuntime } from "./runtime";

export const APP_NAME = "Cliprithm";
export const APP_VERSION = __APP_VERSION__;

export const APP_LINKS = {
  github: "https://github.com/BOTOOM/Cliprithm",
  website: "https://edwardiaz.dev",
  linkedin: "https://www.linkedin.com/in/edwardiazruiz",
  email: "mailto:edwardiazruiz@gmail.com",
  bugReportBase: "https://github.com/BOTOOM/Cliprithm/issues/new",
  bugReport: "https://github.com/BOTOOM/Cliprithm/issues/new?template=bug_report.yml",
  featureRequest: "https://github.com/BOTOOM/Cliprithm/issues/new?template=feature_request.yml",
  contribute: "https://github.com/BOTOOM/Cliprithm/blob/main/CONTRIBUTING.md",
  githubSponsors: "https://github.com/sponsors/BOTOOM",
  buyMeACoffee: "https://www.buymeacoffee.com/edwardiazdev",
} as const;

export async function openExternalUrl(url: string): Promise<void> {
  if (isDesktopRuntime()) {
    await tauriOpenUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function revealPathInFileManager(path: string): Promise<void> {
  if (!isDesktopRuntime()) {
    return;
  }

  await revealItemInDir(path);
}
