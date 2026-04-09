import { getDistributionContext as getRuntimeDistributionContext } from "../services/tauriCommands";
import { isDesktopRuntime } from "./runtime";
import type {
  DistributionChannel,
  DistributionContext,
  RuntimePlatform,
  UpdateStrategy,
  VersionSourceType,
} from "../types/distribution";

const BUILD_DISTRIBUTION = normalizeDistributionContext(__CLIPRITHM_DISTRIBUTION__);

let distributionContextPromise: Promise<DistributionContext> | null = null;

function asChannel(value: string | null | undefined): DistributionChannel {
  switch (value) {
    case "github":
    case "aur":
    case "aur-bin":
    case "snap":
    case "flatpak":
    case "homebrew":
      return value;
    default:
      return "unknown";
  }
}

function asUpdateStrategy(value: string | null | undefined): UpdateStrategy {
  return value === "store-managed" ? "store-managed" : "self-update";
}

function asVersionSourceType(value: string | null | undefined): VersionSourceType {
  switch (value) {
    case "aur-rpc":
    case "snap-info":
    case "flathub-appstream":
    case "homebrew-cask-json":
    case "homebrew-cask-ruby":
      return value;
    default:
      return "none";
  }
}

function defaultStoreName(channel: DistributionChannel): string | null {
  switch (channel) {
    case "aur":
    case "aur-bin":
      return "AUR";
    case "snap":
      return "Snap Store";
    case "flatpak":
      return "Flathub";
    case "homebrew":
      return "Homebrew";
    default:
      return null;
  }
}

function defaultStoreUrl(channel: DistributionChannel, packageName: string | null): string | null {
  switch (channel) {
    case "github":
      return "https://github.com/BOTOOM/Cliprithm/releases/latest";
    case "aur":
    case "aur-bin":
      return packageName ? `https://aur.archlinux.org/packages/${packageName}` : null;
    case "snap":
      return "https://snapcraft.io/cliprithm";
    case "flatpak":
      return "https://flathub.org/apps/details/com.botom.cliprithm";
    case "homebrew":
      return "https://github.com/BOTOOM/homebrew-tap";
    default:
      return null;
  }
}

function defaultStoreInstructions(
  channel: DistributionChannel,
  packageName: string | null
): string | null {
  switch (channel) {
    case "aur":
    case "aur-bin":
      return packageName ? `yay -Syu ${packageName}` : "yay -Syu cliprithm";
    case "snap":
      return packageName ? `sudo snap refresh ${packageName}` : "sudo snap refresh cliprithm";
    case "flatpak":
      return packageName
        ? `flatpak update ${packageName}`
        : "flatpak update com.botom.cliprithm";
    case "homebrew":
      return packageName
        ? `brew upgrade --cask ${packageName}`
        : "brew upgrade --cask cliprithm";
    default:
      return null;
  }
}

function defaultVersionSourceType(channel: DistributionChannel): VersionSourceType {
  switch (channel) {
    case "aur":
    case "aur-bin":
      return "aur-rpc";
    case "snap":
      return "snap-info";
    case "flatpak":
      return "flathub-appstream";
    case "homebrew":
      return "homebrew-cask-json";
    default:
      return "none";
  }
}

function defaultVersionSourceUrl(
  channel: DistributionChannel,
  packageName: string | null
): string | null {
  if ((channel === "aur" || channel === "aur-bin") && packageName) {
    return `https://aur.archlinux.org/rpc/v5/info/${packageName}`;
  }

  if (channel === "snap" && packageName) {
    return `https://api.snapcraft.io/v2/snaps/info/${packageName}`;
  }

  if (channel === "flatpak" && packageName) {
    return `https://flathub.org/api/v2/appstream/${packageName}`;
  }

  if (channel === "homebrew" && packageName) {
    return `https://formulae.brew.sh/api/cask/${packageName}.json`;
  }

  return null;
}

function normalizeDistributionContext(value: Record<string, unknown>): DistributionContext {
  const channel = asChannel(
    typeof value.channel === "string" ? value.channel : null
  );
  const packageName =
    typeof value.packageName === "string" && value.packageName.length > 0
      ? value.packageName
      : channel === "aur-bin"
        ? "cliprithm-bin"
        : channel === "flatpak"
          ? "com.botom.cliprithm"
          : channel === "aur"
          ? "cliprithm"
          : "cliprithm";
  const updateStrategy =
    channel === "github"
      ? "self-update"
      : asUpdateStrategy(typeof value.updateStrategy === "string" ? value.updateStrategy : null);

  return {
    channel,
    updateStrategy,
    packageName,
    storeName:
      typeof value.storeName === "string" && value.storeName.length > 0
        ? value.storeName
        : defaultStoreName(channel),
    storeUrl:
      typeof value.storeUrl === "string" && value.storeUrl.length > 0
        ? value.storeUrl
        : defaultStoreUrl(channel, packageName),
    storeInstructions:
      typeof value.storeInstructions === "string" && value.storeInstructions.length > 0
        ? value.storeInstructions
        : defaultStoreInstructions(channel, packageName),
    versionSourceType:
      typeof value.versionSourceType === "string" && value.versionSourceType.length > 0
        ? asVersionSourceType(value.versionSourceType)
        : defaultVersionSourceType(channel),
    versionSourceUrl:
      typeof value.versionSourceUrl === "string" && value.versionSourceUrl.length > 0
        ? value.versionSourceUrl
        : defaultVersionSourceUrl(channel, packageName),
  };
}

export function getBuildDistributionContext(): DistributionContext {
  return BUILD_DISTRIBUTION;
}

export async function getDistributionContext(): Promise<DistributionContext> {
  if (!isDesktopRuntime()) {
    return BUILD_DISTRIBUTION;
  }

  if (!distributionContextPromise) {
    distributionContextPromise = getRuntimeDistributionContext()
      .then((runtimeContext) =>
        normalizeDistributionContext({
          ...BUILD_DISTRIBUTION,
          ...runtimeContext,
        })
      )
      .catch(() => BUILD_DISTRIBUTION);
  }

  return distributionContextPromise;
}

export function isStoreManagedDistribution(context: DistributionContext): boolean {
  return context.updateStrategy === "store-managed";
}

export function getRuntimePlatform(): RuntimePlatform {
  if (!isDesktopRuntime()) {
    return "unknown";
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes("windows")) {
    return "windows";
  }
  if (userAgent.includes("mac os") || userAgent.includes("macintosh")) {
    return "macos";
  }
  if (userAgent.includes("linux")) {
    return "linux";
  }

  return "unknown";
}
