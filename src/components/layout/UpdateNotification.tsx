import { useEffect, useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; update: Update }
  | { status: "downloading"; percent: number }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "uptodate" };

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const update = await check();
      if (update) {
        setState({ status: "available", update });
      } else {
        setState({ status: "uptodate" });
        // Auto-hide "up to date" after 3s
        setTimeout(() => setState({ status: "idle" }), 3000);
      }
    } catch (err) {
      console.error("Update check failed:", err);
      setState({ status: "idle" });
    }
  }, []);

  // Check for updates on mount and every 30 minutes
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
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            const percent =
              totalBytes > 0
                ? Math.round((downloadedBytes / totalBytes) * 100)
                : 0;
            setState({ status: "downloading", percent });
            break;
          case "Finished":
            setState({ status: "ready" });
            break;
        }
      });

      setState({ status: "ready" });
    } catch (err) {
      setState({
        status: "error",
        message: String(err),
      });
    }
  };

  const handleRestart = async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  };

  if (state.status === "idle" || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-96 glass-panel rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      {/* Checking */}
      {state.status === "checking" && (
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center animate-spin">
            <Icon name="sync" className="text-primary text-lg" />
          </div>
          <div>
            <p className="text-xs font-bold text-on-surface">
              Checking for updates...
            </p>
          </div>
        </div>
      )}

      {/* Up to date */}
      {state.status === "uptodate" && (
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center">
            <Icon name="check_circle" className="text-primary text-lg" />
          </div>
          <p className="text-xs font-medium text-on-surface-variant">
            You're running the latest version!
          </p>
        </div>
      )}

      {/* Update available */}
      {state.status === "available" && (
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="system_update" className="text-primary text-xl" />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">
                  Update Available
                </p>
                <p className="text-[10px] text-on-surface-variant">
                  Version {state.update.version}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
            >
              Later
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleDownloadAndInstall}
            >
              Download & Install
            </Button>
          </div>
        </div>
      )}

      {/* Downloading */}
      {state.status === "downloading" && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Icon name="downloading" className="text-primary text-xl" />
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface">
                Downloading update...
              </p>
              <p className="text-[10px] text-on-surface-variant">
                {state.percent}% complete
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

      {/* Ready to restart */}
      {state.status === "ready" && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Icon name="restart_alt" className="text-primary text-xl" />
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface">
                Update ready!
              </p>
              <p className="text-[10px] text-on-surface-variant">
                Restart the app to apply the update.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
            >
              Later
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1"
              onClick={handleRestart}
            >
              Restart Now
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="p-4 flex items-center gap-3">
          <Icon name="error" className="text-error text-lg" />
          <div className="flex-1">
            <p className="text-xs font-bold text-error">Update failed</p>
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
