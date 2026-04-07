import { APP_VERSION } from "../lib/appInfo";
import type { DistributionContext } from "../types/distribution";

interface AurRpcResponse {
  resultcount: number;
  results: Array<{
    Version: string;
  }>;
}

interface SnapInfoResponse {
  "channel-map"?: Array<{
    channel?: {
      risk?: string;
      track?: string;
    };
    version?: string;
  }>;
}

interface FlathubAppstreamResponse {
  releases?: Array<{
    version?: string;
    type?: string;
  }>;
}

interface HomebrewCaskResponse {
  version?: string;
}

function extractHomebrewVersionFromRuby(source: string): string | null {
  const match = source.match(/^\s*version\s+["']([^"']+)["']/m);
  return match?.[1] ? normalizeVersion(match[1]) : null;
}

export interface StoreUpdateResult {
  available: boolean;
  latestVersion: string | null;
}

function normalizeVersion(version: string): string {
  return version.trim().split("-")[0];
}

function parseVersionPart(part: string): number {
  const numeric = part.match(/\d+/)?.[0];
  return numeric ? Number.parseInt(numeric, 10) : 0;
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split(".");
  const right = normalizeVersion(b).split(".");
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = parseVersionPart(left[index] ?? "0") - parseVersionPart(right[index] ?? "0");
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

export async function checkStoreManagedUpdate(
  context: DistributionContext
): Promise<StoreUpdateResult> {
  if (context.versionSourceType === "none" || !context.versionSourceUrl) {
    return {
      available: false,
      latestVersion: null,
    };
  }

  const headers =
    context.versionSourceType === "snap-info"
      ? {
          Accept: "application/json",
          "Snap-Device-Series": "16",
        }
      : undefined;

  const response = await fetch(context.versionSourceUrl, { headers });
  if (!response.ok) {
    throw new Error(`Store update check failed with ${response.status}`);
  }

  let latestVersion: string | null = null;

  switch (context.versionSourceType) {
    case "aur-rpc": {
      const payload = (await response.json()) as AurRpcResponse;
      latestVersion = payload.results[0]?.Version
        ? normalizeVersion((payload as AurRpcResponse).results[0].Version)
        : null;
      break;
    }
    case "snap-info": {
      const payload = (await response.json()) as SnapInfoResponse;
      const stableChannel = payload["channel-map"]?.find(
        (entry) =>
          entry.channel?.track === "latest" &&
          entry.channel?.risk === "stable" &&
          typeof entry.version === "string"
      );
      latestVersion = stableChannel?.version ? normalizeVersion(stableChannel.version) : null;
      break;
    }
    case "flathub-appstream": {
      const payload = (await response.json()) as FlathubAppstreamResponse;
      const stableRelease = payload.releases?.find(
        (entry) => entry.type === "stable" && typeof entry.version === "string"
      );
      latestVersion = stableRelease?.version ? normalizeVersion(stableRelease.version) : null;
      break;
    }
    case "homebrew-cask-json": {
      const payload = (await response.json()) as HomebrewCaskResponse;
      latestVersion = payload.version
        ? normalizeVersion(payload.version)
        : null;
      break;
    }
    case "homebrew-cask-ruby":
      latestVersion = extractHomebrewVersionFromRuby(await response.text());
      break;
    default:
      latestVersion = null;
  }

  return {
    available: latestVersion ? compareVersions(latestVersion, APP_VERSION) > 0 : false,
    latestVersion,
  };
}
