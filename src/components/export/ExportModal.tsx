import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { log } from "../../lib/logger";
import { useI18n } from "../../lib/i18n";
import { isDesktopRuntime } from "../../lib/runtime";
import { useProjectStore } from "../../stores/projectStore";
import { exportVideo } from "../../services/tauriCommands";
import type { ProcessingProgress } from "../../types";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

const PRESETS = [
  {
    id: "tiktok" as const,
    label: "TikTok / Shorts",
    ratio: "9:16 Ratio",
    icon: "smartphone",
    color: "text-primary",
  },
  {
    id: "reels" as const,
    label: "Instagram Reels",
    ratio: "9:16 Ratio",
    icon: "spool",
    color: "text-secondary",
  },
  {
    id: "custom" as const,
    label: "Custom",
    ratio: "Manual Settings",
    icon: "tune",
    color: "text-tertiary",
  },
];

export function ExportModal() {
  const { t } = useI18n();
  const {
    setShowExportModal,
    exportSettings,
    updateExportSettings,
    filePath,
    videoMetadata,
    clipSegments,
    detectionSettings,
    setProcessedFilePath,
  } = useProjectStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const presets = [
    {
      ...PRESETS[0],
      label: PRESETS[0].label,
      ratio: PRESETS[0].ratio,
    },
    {
      ...PRESETS[1],
      label: PRESETS[1].label,
      ratio: PRESETS[1].ratio,
    },
    {
      ...PRESETS[2],
      label: t("exportModal.custom"),
      ratio: t("exportModal.manualSettings"),
    },
  ];

  useEffect(() => {
    if (!isDesktopRuntime() || !isExporting) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<ProcessingProgress>("export-progress", (event) => {
      setExportProgress(Math.round(event.payload.percent));
      setExportMessage(event.payload.message);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isExporting]);

  const estimatedSize = videoMetadata
    ? (videoMetadata.file_size *
        (exportSettings.resolution === "4k" ? 2 : 1) *
        (exportSettings.fps === 60 ? 1.5 : 1)) /
      1024 /
      1024
    : 0;

  const handleExport = useCallback(async () => {
    if (!filePath || clipSegments.length === 0 || !isDesktopRuntime()) {
      setError(t("exportModal.desktopOnly"));
      return;
    }

    const outputPath = await save({
      defaultPath: `${exportSettings.fileName}.mp4`,
      filters: [{ name: "Video", extensions: ["mp4"] }],
    });

    if (!outputPath) return;

    setError(null);
    setIsExporting(true);
    setExportProgress(5);
    setExportMessage(t("exportModal.preparing"));

    try {
      const result = await exportVideo({
        input_path: filePath,
        output_path: outputPath,
        segments_to_keep: clipSegments.map((clip) => [clip.start, clip.end]),
        resolution: exportSettings.resolution,
        fps: exportSettings.fps,
        mode: detectionSettings.mode,
        speed_multiplier:
          detectionSettings.mode === "speed"
            ? detectionSettings.speedMultiplier
            : null,
        playback_rate:
          (detectionSettings.playbackRate ?? 1.0) !== 1.0
            ? detectionSettings.playbackRate
            : null,
      });
      setProcessedFilePath(result);
      setExportProgress(100);
      setExportMessage(t("exportModal.exportComplete"));
      setTimeout(() => {
        setShowExportModal(false);
      }, 900);
    } catch (err) {
      log.error("[export]", "Export failed:", err);
      setError(String(err));
    } finally {
      setIsExporting(false);
    }
  }, [
    clipSegments,
    detectionSettings.mode,
    detectionSettings.speedMultiplier,
    exportSettings.fileName,
    exportSettings.fps,
    exportSettings.resolution,
    filePath,
    setProcessedFilePath,
    setShowExportModal,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-surface-container-lowest/40">
      <div className="w-full max-w-2xl glass-panel ghost-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-8 pt-8 pb-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">{t("exportModal.title")}</h2>
          <button
            onClick={() => setShowExportModal(false)}
            className="text-on-surface-variant hover:text-white transition-colors"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="px-8 py-6 space-y-8 overflow-y-auto max-h-[716px]">
          <section className="space-y-4">
            <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              {t("exportModal.presets")}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => updateExportSettings({ preset: preset.id })}
                  className={`p-4 rounded-lg text-left transition-all ${
                    exportSettings.preset === preset.id
                      ? "bg-surface-container-highest border border-primary/40"
                      : "bg-surface-container-high border border-transparent hover:border-primary-dim/30 hover:bg-surface-container-highest"
                  }`}
                >
                  <Icon name={preset.icon} className={`${preset.color} mb-2`} />
                  <div className="font-medium text-sm text-on-surface">
                    {preset.label}
                  </div>
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                    {preset.ratio}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              {t("exportModal.fileName")}
            </label>
            <input
              type="text"
              value={exportSettings.fileName}
              onChange={(event) =>
                updateExportSettings({ fileName: event.target.value })
              }
              className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2.5 px-4 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                {t("exportModal.resolution")}
              </label>
              <div className="flex flex-col gap-2">
                {(["1080p", "4k"] as const).map((resolution) => (
                  <label key={resolution} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      checked={exportSettings.resolution === resolution}
                      onChange={() =>
                        updateExportSettings({ resolution })
                      }
                      className="text-primary bg-surface-container border-outline-variant"
                    />
                    <span
                      className={`text-sm ${
                        exportSettings.resolution === resolution
                          ? "text-on-surface font-medium"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {resolution === "1080p" ? "1080p (Full HD)" : "4K (Ultra HD)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                {t("exportModal.frameRate")}
              </label>
              <div className="flex flex-col gap-2">
                {([60, 30] as const).map((fps) => (
                  <label key={fps} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="fps"
                      checked={exportSettings.fps === fps}
                      onChange={() => updateExportSettings({ fps })}
                      className="text-primary bg-surface-container border-outline-variant"
                    />
                    <span
                      className={`text-sm ${
                        exportSettings.fps === fps
                          ? "text-on-surface font-medium"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {fps === 60 ? "60fps (Smooth)" : "30fps (Standard)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-surface-container-low/50 flex items-center justify-between border-l-2 border-primary-dim">
            <div className="flex items-center gap-3">
              <Icon name="info" className="text-primary-fixed text-xl" />
              <div>
                <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                   {t("exportModal.estimatedFileSize")}
                </div>
                <div className="text-lg font-mono text-white">{estimatedSize.toFixed(1)} MB</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-on-surface-variant">{t("exportModal.clips")}</div>
              <div className="text-sm font-medium text-on-surface">{clipSegments.length}</div>
            </div>
          </div>

          {isExporting && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>{exportMessage || t("exportModal.exporting")}</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary shimmer rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="px-8 py-8 flex items-center justify-end gap-4 bg-surface-container-high/30">
          <Button variant="ghost" onClick={() => setShowExportModal(false)}>
            {t("exportModal.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={isExporting || clipSegments.length === 0}
            className="px-10"
          >
            {isExporting ? `${t("exportModal.exporting")} ${exportProgress}%` : t("exportModal.exportNow")}
          </Button>
        </div>
      </div>
    </div>
  );
}
