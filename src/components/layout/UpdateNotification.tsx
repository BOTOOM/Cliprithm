import { useEffect, useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  getDistributionContext,
  getRuntimePlatform,
} from "../../lib/distribution";
import { openExternalUrl } from "../../lib/appInfo";
import { log } from "../../lib/logger";
import { useI18n } from "../../lib/i18n";
import { isDesktopRuntime } from "../../lib/runtime";
import { checkStoreManagedUpdate } from "../../services/storeUpdates";
import type { DistributionContext } from "../../types/distribution";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; update: Update }
  | {
      status: "manual-update-available";
      distribution: DistributionContext;
      latestVersion: string | null;
      autoUpdateFailed: boolean;
    }
  | { status: "downloading"; percent: number }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "uptodate" };

export function UpdateNotification() {
  const { t } = useI18n();
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdates = useCallback(async () => {
    if (!isDesktopRuntime()) {
      return;
    }

    setState({ status: "checking" });
    try {
      const distribution = await getDistributionContext();
      const runtimePlatform = getRuntimePlatform();
      const linuxRuntime = runtimePlatform === "linux";

      if (!linuxRuntime) {
        const update = await check();
        if (update) {
          log.info("[updater]", `Update available: ${update.version}`);
          setState({ status: "available", update });
        } else {
          setState({ status: "uptodate" });
          setTimeout(() => setState({ status: "idle" }), 3000);
        }
        return;
      }

      let updaterCheckFailed = false;
      try {
        const update = await check();
        if (update) {
          log.info("[updater]", `Update available: ${update.version}`);
          setState({ status: "available", update });
          return;
        }
      } catch (updaterError) {
        updaterCheckFailed = true;
        log.warn("[updater]", "Automatic update check failed on Linux:", updaterError);
      }

      let storeCheckFailed = false;
      try {
        const storeUpdate = await checkStoreManagedUpdate(distribution);
        if (storeUpdate.available) {
          setState({
            status: "manual-update-available",
            distribution,
            latestVersion: storeUpdate.latestVersion,
            autoUpdateFailed: false,
          });
          return;
        }
      } catch (storeError) {
        storeCheckFailed = true;
        log.warn("[updater]", "Linux fallback update check failed:", storeError);
      }

      if (!updaterCheckFailed && !storeCheckFailed) {
        setState({ status: "uptodate" });
        setTimeout(() => setState({ status: "idle" }), 3000);
      } else {
        setState({ status: "idle" });
      }
    } catch (err) {
      const message = String(err);
      if (
        message.includes("valid release JSON") ||
        message.includes("successful status code")
      ) {
        log.debug(
          "[updater]",
          "Skipping update notification because latest.json is not available yet."
        );
      } else {
        log.warn("[updater]", "Update check failed:", err);
      }
      setState({ status: "idle" });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkForUpdates, 3000);
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [checkForUpdates]);

  const handleDownloadAndInstall = async () => {
    if (state.status !== "available") return;
    const update = state.update;

    try {
      let downloadedBytes = 0;
      let totalBytes = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength ?? 0;
            setState({ status: "downloading", percent: 0 });
            break;
          case "Progress": {
            downloadedBytes += event.data.chunkLength;
            const percent =
              totalBytes > 0
                ? Math.round((downloadedBytes / totalBytes) * 100)
                : 0;
            setState({ status: "downloading", percent });
            break;
          }
          case "Finished":
            setState({ status: "ready" });
            break;
        }
      });

      setState({ status: "ready" });
    } catch (err) {
      if (getRuntimePlatform() === "linux") {
        const distribution = await getDistributionContext();
        log.warn("[updater]", "Automatic Linux update failed, falling back to manual update.", err);
        setState({
          status: "manual-update-available",
          distribution,
          latestVersion: state.update.version,
          autoUpdateFailed: true,
        });
        return;
      }

      setState({ status: "error", message: String(err) });
    }
  };

  const handleRestart = async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  };

  const handleOpenStore = async () => {
    if (state.status !== "manual-update-available") return;
    if (!state.distribution.storeUrl) return;
    await openExternalUrl(state.distribution.storeUrl);
  };

  const handleCopyStoreCommand = async () => {
    if (state.status !== "manual-update-available") return;
    if (!state.distribution.storeInstructions) return;
    await copyTextToClipboard(state.distribution.storeInstructions);
  };

  if (state.status === "idle" || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-96 glass-panel rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      {state.status === "checking" && (
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center animate-spin">
            <Icon name="sync" className="text-primary text-lg" />
          </div>
          <div>
              <p className="text-xs font-bold text-on-surface">
               {t("updates.checking")}
              </p>
          </div>
        </div>
      )}

      {state.status === "uptodate" && (
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center">
            <Icon name="check_circle" className="text-primary text-lg" />
          </div>
          <p className="text-xs font-medium text-on-surface-variant">
            {t("updates.latestVersion")}
          </p>
        </div>
      )}

      {state.status === "manual-update-available" && (
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="system_update_alt" className="text-primary text-xl" />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">
                  {t("updates.manualUpdateAvailable")}
                </p>
                <p className="text-[10px] text-on-surface-variant">
                  {t("updates.version", {
                    version: state.latestVersion ?? "n/a",
                  })}
                </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-on-surface-variant hover:text-white transition-colors"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
          <p className="text-[11px] text-on-surface-variant mb-4 leading-relaxed">
            {state.autoUpdateFailed
              ? t("updates.manualUpdateFallbackDescription")
              : t("updates.manualUpdateAvailableDescription")}
          </p>
          {state.distribution.storeInstructions && (
            <div className="mb-4 rounded-lg bg-surface-container-highest px-3 py-2">
              <p className="text-[10px] text-on-surface-variant mb-1">
                {t("updates.runCommand")}
              </p>
              <code className="text-[11px] text-primary break-all">
                {state.distribution.storeInstructions}
              </code>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
              {t("updates.later")}
            </Button>
            <Button
              variant="surface"
              size="sm"
              onClick={handleCopyStoreCommand}
              disabled={!state.distribution.storeInstructions}
            >
              {t("updates.copyCommand")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleOpenStore}
              disabled={!state.distribution.storeUrl}
            >
              {t("updates.openDownloadSource")}
            </Button>
          </div>
        </div>
      )}

      {state.status === "available" && (
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="system_update" className="text-primary text-xl" />
              </div>
              <div>
                 <p className="text-sm font-bold text-on-surface">
                   {t("updates.available")}
                 </p>
                 <p className="text-[10px] text-on-surface-variant">
                   {t("updates.version", { version: state.update.version })}
                 </p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-on-surface-variant hover:text-white transition-colors"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
          {state.update.body && (
            <p className="text-[11px] text-on-surface-variant mb-4 leading-relaxed line-clamp-3">
              {state.update.body}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
               {t("updates.later")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleDownloadAndInstall}
            >
               {t("updates.downloadInstall")}
            </Button>
          </div>
        </div>
      )}

      {state.status === "downloading" && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Icon name="downloading" className="text-primary text-xl" />
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface">
                 {t("updates.downloading")}
              </p>
              <p className="text-[10px] text-on-surface-variant">
                 {t("updates.percentComplete", { percent: state.percent })}
              </p>
            </div>
          </div>
          <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary shimmer rounded-full transition-all duration-300"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Icon name="restart_alt" className="text-primary text-xl" />
            </div>
            <div>
               <p className="text-sm font-bold text-on-surface">{t("updates.ready")}</p>
               <p className="text-[10px] text-on-surface-variant">
                 {t("updates.restartToApply")}
               </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
               {t("updates.later")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleRestart}
            >
               {t("updates.restartNow")}
            </Button>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="p-4 flex items-center gap-3">
          <Icon name="error" className="text-error text-lg" />
          <div className="flex-1">
            <p className="text-xs font-bold text-error">{t("updates.failed")}</p>
            <p className="text-[10px] text-on-surface-variant truncate">
              {state.message}
            </p>
          </div>
          <button
            onClick={() => setState({ status: "idle" })}
            className="text-on-surface-variant hover:text-white"
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      )}
    </div>
  );
}
