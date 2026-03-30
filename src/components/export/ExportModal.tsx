import { useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../../stores/projectStore";
import { exportVideo } from "../../services/tauriCommands";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { formatFileSize } from "../../lib/utils";

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
  const {
    setShowExportModal,
    exportSettings,
    updateExportSettings,
    processedFilePath,
    filePath,
    videoMetadata,
  } = useProjectStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const inputPath = processedFilePath || filePath || "";
  const estimatedSize = videoMetadata
    ? (videoMetadata.file_size *
        (exportSettings.resolution === "4k" ? 2 : 1) *
        (exportSettings.fps === 60 ? 1.5 : 1)) /
      1024 /
      1024
    : 0;

  const handleExport = useCallback(async () => {
    const outputPath = await save({
      defaultPath: `${exportSettings.fileName}.mp4`,
      filters: [{ name: "Video", extensions: ["mp4"] }],
    });
    if (!outputPath) return;

    setIsExporting(true);
    setExportProgress(10);

    try {
      await exportVideo({
        input_path: inputPath,
        output_path: outputPath,
        segments_to_keep: [],
        resolution: exportSettings.resolution,
        fps: exportSettings.fps,
        mode: "export",
        speed_multiplier: null,
      });
      setExportProgress(100);
      setTimeout(() => {
        setShowExportModal(false);
      }, 1000);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [inputPath, exportSettings, setShowExportModal]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-surface-container-lowest/40">
      <div className="w-full max-w-2xl glass-panel ghost-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Export Video
          </h2>
          <button
            onClick={() => setShowExportModal(false)}
            className="text-on-surface-variant hover:text-white transition-colors"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-8 overflow-y-auto max-h-[716px]">
          {/* Presets */}
          <section className="space-y-4">
            <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              Presets
            </label>
            <div className="grid grid-cols-3 gap-3">
              {PRESETS.map((preset) => (
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

          {/* File Name */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              File Name
            </label>
            <input
              type="text"
              value={exportSettings.fileName}
              onChange={(e) =>
                updateExportSettings({ fileName: e.target.value })
              }
              className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2.5 px-4 text-sm"
            />
          </div>

          {/* Resolution & FPS */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Resolution
              </label>
              <div className="flex flex-col gap-2">
                {(["1080p", "4k"] as const).map((res) => (
                  <label
                    key={res}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="resolution"
                      checked={exportSettings.resolution === res}
                      onChange={() => updateExportSettings({ resolution: res })}
                      className="text-primary bg-surface-container border-outline-variant"
                    />
                    <span
                      className={`text-sm ${exportSettings.resolution === res ? "text-on-surface font-medium" : "text-on-surface-variant"}`}
                    >
                      {res === "1080p" ? "1080p (Full HD)" : "4K (Ultra HD)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Frame Rate
              </label>
              <div className="flex flex-col gap-2">
                {([60, 30] as const).map((fps) => (
                  <label
                    key={fps}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="fps"
                      checked={exportSettings.fps === fps}
                      onChange={() => updateExportSettings({ fps })}
                      className="text-primary bg-surface-container border-outline-variant"
                    />
                    <span
                      className={`text-sm ${exportSettings.fps === fps ? "text-on-surface font-medium" : "text-on-surface-variant"}`}
                    >
                      {fps === 60 ? "60fps (Smooth)" : "30fps (Standard)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Estimated size */}
          <div className="p-4 rounded-lg bg-surface-container-low/50 flex items-center justify-between border-l-2 border-primary-dim">
            <div className="flex items-center gap-3">
              <Icon name="info" className="text-primary-fixed text-xl" />
              <div>
                <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                  Estimated File Size
                </div>
                <div className="text-lg font-mono text-white">
                  {estimatedSize.toFixed(1)} MB
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-on-surface-variant">Format</div>
              <div className="text-sm font-medium text-on-surface">
                MP4 (H.264)
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 py-8 flex items-center justify-end gap-4 bg-surface-container-high/30">
          <Button variant="ghost" onClick={() => setShowExportModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={isExporting}
            className="px-10"
          >
            {isExporting ? `Exporting... ${exportProgress}%` : "Export Now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
