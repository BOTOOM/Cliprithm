import { useMemo, useState } from "react";
import { copyTextToClipboard } from "../../lib/clipboard";
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

function getCommandsForPlatform(platform: FfmpegStatus["platform"] | undefined): string[] {
  switch (platform) {
    case "windows":
      return ["winget install ffmpeg"];
    case "macos":
      return ["brew install ffmpeg"];
    default:
      return ["sudo pacman -S ffmpeg", "sudo apt install ffmpeg", "sudo dnf install ffmpeg"];
  }
}

function getDescriptionKey(platform: FfmpegStatus["platform"] | undefined): string {
  switch (platform) {
    case "windows":
      return "ffmpegMissingWindows";
    case "macos":
      return "ffmpegMissingMac";
    default:
      return "ffmpegMissingLinux";
  }
}

export function FfmpegHelpPanel({
  status,
  title,
  description,
  onRetry,
  retrying = false,
  showDownloadButton = false,
  onDownload,
}: FfmpegHelpPanelProps) {
  const { t } = useI18n();
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const commands = useMemo(() => getCommandsForPlatform(status?.platform), [status?.platform]);
  const installDescription = t(`importView.${getDescriptionKey(status?.platform)}`);

  const handleCopy = async (command: string) => {
    await copyTextToClipboard(command);
    setCopiedCommand(command);
    window.setTimeout(() => {
      setCopiedCommand((current) => (current === command ? null : current));
    }, 1500);
  };

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
      <p className="text-xs text-on-surface-variant leading-relaxed mb-2">{description}</p>
      <p className="text-xs text-on-surface-variant leading-relaxed mb-3">{installDescription}</p>
      <div className="space-y-2 mb-3">
        {commands.map((command) => (
          <div
            key={command}
            className="flex flex-col gap-2 rounded-md border border-outline-variant/20 bg-surface/70 p-3"
          >
            <code className="text-xs text-on-surface break-all">{command}</code>
            <div className="flex flex-wrap gap-2">
              <Button variant="surface" size="sm" onClick={() => void handleCopy(command)}>
                <Icon name="content_copy" className="text-sm" />
                {copiedCommand === command ? t("importView.ffmpegCommandCopied") : t("importView.ffmpegCopyCommand")}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
        {t("importView.ffmpegOpenTerminalHint")}
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