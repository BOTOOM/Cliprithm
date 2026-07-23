import { useState } from "react";
import { useI18n } from "../../lib/i18n";
import type { FfmpegStatus } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface FfmpegHelpPanelProps {
  status: FfmpegStatus | null;
  title: string;
  description: string;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
  showDownloadButton?: boolean;
  onDownload?: () => void | Promise<void>;
}

export function FfmpegHelpPanel({
  title,
  description,
  onRetry,
  retrying = false,
  showDownloadButton = false,
  onDownload,
}: FfmpegHelpPanelProps) {
  const { t } = useI18n();
  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-left">
      <div className="text-[10px] font-bold uppercase tracking-widest text-error mb-1">
        {title}
      </div>
      <p className="text-xs text-on-surface-variant leading-relaxed mb-3">{description}</p>
      <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
        {t("importView.ffmpegBundledRecovery")}
      </p>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="surface" size="sm" onClick={() => void onRetry()} disabled={retrying}>
            <Icon name="refresh" className="text-sm" />
            {retrying ? "..." : t("importView.ffmpegRetry")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => void handleRestart()} disabled={restarting}>
          <Icon name="restart_alt" className="text-sm" />
          {restarting ? "..." : t("importView.ffmpegRestartApp")}
        </Button>
        {showDownloadButton && onDownload && (
          <Button variant="ghost" size="sm" onClick={() => void onDownload()}>
            <Icon name="download" className="text-sm" />
            {t("importView.ffmpegDownloadLink")}
          </Button>
        )}
      </div>
    </div>
  );
}