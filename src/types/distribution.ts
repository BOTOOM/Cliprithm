export type DistributionChannel =
  | "github"
  | "aur"
  | "aur-bin"
  | "snap"
  | "flatpak"
  | "homebrew"
  | "unknown";

export type UpdateStrategy = "self-update" | "store-managed";

export type RuntimePlatform = "windows" | "macos" | "linux" | "unknown";

export type VersionSourceType =
  | "none"
  | "aur-rpc"
  | "snap-info"
  | "flathub-appstream"
  | "homebrew-cask-json"
  | "homebrew-cask-ruby";

export interface DistributionContext {
  channel: DistributionChannel;
  updateStrategy: UpdateStrategy;
  packageName: string | null;
  storeName: string | null;
  storeUrl: string | null;
  storeInstructions: string | null;
  versionSourceType: VersionSourceType;
  versionSourceUrl: string | null;
}
