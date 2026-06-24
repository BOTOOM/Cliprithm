import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { log } from "../../lib/logger";
import { resolveMediaSrc } from "../../lib/media";
import { useI18n } from "../../lib/i18n";
import { isDesktopRuntime } from "../../lib/runtime";
import { formatFileSize, formatTime } from "../../lib/utils";
import { useProjectStore } from "../../stores/projectStore";
import { exportVideo, generateExportPreview } from "../../services/tauriCommands";
import type {
  ExportResizeMode,
  ExportSettings,
  PreviewSegment,
  ProcessingProgress,
} from "../../types";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { FfmpegHelpPanel } from "../shared/FfmpegHelpPanel";

const PRESETS = [
  {
    id: "tiktok" as const,
    labelKey: "exportModal.tiktokShorts",
    ratioKey: "exportModal.verticalRatio",
    icon: "smartphone",
    color: "text-primary",
  },
  {
    id: "reels" as const,
    labelKey: "exportModal.instagramReels",
    ratioKey: "exportModal.verticalRatio",
    icon: "spool",
    color: "text-secondary",
  },
  {
    id: "custom" as const,
    labelKey: "exportModal.custom",
    ratioKey: "exportModal.manualSettings",
    icon: "tune",
    color: "text-tertiary",
  },
];

const CREATOR_TARGETS = [
  {
    id: "vertical-social",
    width: 1080,
    height: 1920,
    labelKey: "exportModal.creatorTargetVertical",
    descriptionKey: "exportModal.creatorTargetVerticalDescription",
  },
  {
    id: "youtube-landscape",
    width: 1920,
    height: 1080,
    labelKey: "exportModal.creatorTargetYoutube",
    descriptionKey: "exportModal.creatorTargetYoutubeDescription",
  },
  {
    id: "square-social",
    width: 1080,
    height: 1080,
    labelKey: "exportModal.creatorTargetSquare",
    descriptionKey: "exportModal.creatorTargetSquareDescription",
  },
  {
    id: "landscape-4k",
    width: 3840,
    height: 2160,
    labelKey: "exportModal.creatorTargetLandscape4k",
    descriptionKey: "exportModal.creatorTargetLandscape4kDescription",
  },
  {
    id: "vertical-4k",
    width: 2160,
    height: 3840,
    labelKey: "exportModal.creatorTargetVertical4k",
    descriptionKey: "exportModal.creatorTargetVertical4kDescription",
  },
] as const;

const CUSTOM_SIZE_MODES = [
  { id: "original" as const, labelKey: "exportModal.sizeModeOriginal" },
  { id: "preset" as const, labelKey: "exportModal.sizeModePreset" },
  { id: "custom" as const, labelKey: "exportModal.sizeModeCustom" },
];

const RESIZE_MODE_OPTIONS = [
  {
    id: "original" as const,
    labelKey: "exportModal.resizeModeOriginalLabel",
    descriptionKey: "exportModal.resizeModeOriginalDescription",
  },
  {
    id: "fit" as const,
    labelKey: "exportModal.resizeModeFitLabel",
    descriptionKey: "exportModal.resizeModeFitDescription",
  },
  {
    id: "crop" as const,
    labelKey: "exportModal.resizeModeCropLabel",
    descriptionKey: "exportModal.resizeModeCropDescription",
  },
  {
    id: "stretch" as const,
    labelKey: "exportModal.resizeModeStretchLabel",
    descriptionKey: "exportModal.resizeModeStretchDescription",
  },
] as const;

function getPresetDimensions(
  preset: ExportSettings["preset"],
  resolution: ExportSettings["resolution"]
) {
  const is4k = resolution === "4k";

  if (preset === "tiktok" || preset === "reels") {
    return is4k ? { width: 2160, height: 3840 } : { width: 1080, height: 1920 };
  }

  if (preset === "youtube") {
    return is4k ? { width: 3840, height: 2160 } : { width: 1920, height: 1080 };
  }

  if (preset === "square") {
    return is4k ? { width: 2160, height: 2160 } : { width: 1080, height: 1080 };
  }

  return { width: 1920, height: 1080 };
}

function buildPreviewSegments(
  clips: Array<{ start: number; end: number }>
): PreviewSegment[] {
  return clips.map((clip) => ({ start: clip.start, end: clip.end }));
}

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
    ffmpegStatus,
  } = useProjectStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequestRef = useRef(0);
  const getStageLabel = useCallback(
    (payload: ProcessingProgress) => {
      switch (payload.stage) {
        case "exporting":
          return t("processing.exporting");
        case "encoding":
          return t("processing.encoding");
        case "complete":
          return t("exportModal.exportComplete");
        default:
          return payload.message || t("exportModal.exporting");
      }
    },
    [t]
  );

  const presets = [
    {
      ...PRESETS[0],
      label: t(PRESETS[0].labelKey),
      ratio: t(PRESETS[0].ratioKey),
    },
    {
      ...PRESETS[1],
      label: t(PRESETS[1].labelKey),
      ratio: t(PRESETS[1].ratioKey),
    },
    {
      ...PRESETS[2],
      label: t(PRESETS[2].labelKey),
      ratio: t(PRESETS[2].ratioKey),
    },
  ];

  const customTarget = useMemo(() => {
    if (exportSettings.sizingMode === "original" && videoMetadata) {
      return {
        width: videoMetadata.width,
        height: videoMetadata.height,
      };
    }

    return {
      width: exportSettings.width,
      height: exportSettings.height,
    };
  }, [
    exportSettings.height,
    exportSettings.sizingMode,
    exportSettings.width,
    videoMetadata,
  ]);

  const presetTarget = useMemo(
    () => getPresetDimensions(exportSettings.preset, exportSettings.resolution),
    [exportSettings.preset, exportSettings.resolution]
  );

  const activeTarget =
    exportSettings.preset === "custom" ? customTarget : presetTarget;
  const activeResizeMode: ExportResizeMode =
    exportSettings.preset === "custom"
      ? exportSettings.sizingMode === "original"
        ? "original"
        : exportSettings.resizeMode
      : "fit";
  const previewAspectRatio =
    activeTarget.width > 0 && activeTarget.height > 0
      ? `${activeTarget.width} / ${activeTarget.height}`
      : "16 / 9";
  const selectedCreatorTargetId =
    CREATOR_TARGETS.find(
      (target) =>
        target.width === exportSettings.width && target.height === exportSettings.height
    )?.id ?? null;
  const resizeModeDescription = t(
    RESIZE_MODE_OPTIONS.find((option) => option.id === activeResizeMode)?.descriptionKey ??
      "exportModal.resizeModeFitDescription"
  );

  useEffect(() => {
    if (!isDesktopRuntime() || !isExporting) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<ProcessingProgress>("export-progress", (event) => {
      setExportProgress(Math.round(event.payload.percent));
      setExportMessage(getStageLabel(event.payload));
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
  }, [getStageLabel, isExporting]);

  const estimatedDurationSeconds = clipSegments.reduce(
    (total, clip) => total + clip.duration,
    0
  );
  const previewDurationSeconds =
    (detectionSettings.playbackRate ?? 1.0) > 0.01
      ? estimatedDurationSeconds / (detectionSettings.playbackRate ?? 1.0)
      : estimatedDurationSeconds;
  const ffmpegUnavailable = isDesktopRuntime() && ffmpegStatus?.available === false;

  useEffect(() => {
    if (
      exportSettings.preset !== "custom" ||
      !isDesktopRuntime() ||
      !filePath ||
      !videoMetadata ||
      clipSegments.length === 0 ||
      ffmpegUnavailable
    ) {
      setPreviewLoading(false);
      setPreviewError(null);
      setPreviewImageSrc(null);
      return;
    }

    if (activeTarget.width <= 0 || activeTarget.height <= 0) {
      setPreviewLoading(false);
      setPreviewImageSrc(null);
      setPreviewError(t("exportModal.invalidDimensions"));
      return;
    }

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      void (async () => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
          const dataDir = await appDataDir();
          const outputPath = `${dataDir}/export-previews/export-preview-${Date.now()}.jpg`;
          const previewPath = await generateExportPreview({
            inputPath: filePath,
            outputPath,
            segmentsToKeep: buildPreviewSegments(clipSegments),
            targetWidth: activeTarget.width,
            targetHeight: activeTarget.height,
            resizeMode: activeResizeMode,
          });

          if (previewRequestRef.current !== requestId) {
            return;
          }

          setPreviewImageSrc(`${resolveMediaSrc(previewPath)}?v=${Date.now()}`);
        } catch (previewErr) {
          log.error("[export-preview]", "Still preview generation failed:", previewErr);
          if (previewRequestRef.current !== requestId) {
            return;
          }
          setPreviewImageSrc(null);
          setPreviewError(t("exportModal.previewUnavailable"));
        } finally {
          if (previewRequestRef.current === requestId) {
            setPreviewLoading(false);
          }
        }
      })();
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeResizeMode,
    activeTarget.height,
    activeTarget.width,
    clipSegments,
    exportSettings.preset,
    ffmpegUnavailable,
    filePath,
    t,
    videoMetadata,
  ]);

  const applyCustomSizeMode = useCallback(
    (sizeMode: ExportSettings["sizingMode"]) => {
      if (sizeMode === "original") {
        updateExportSettings({
          preset: "custom",
          sizingMode: "original",
          resizeMode: "original",
          width: videoMetadata?.width ?? exportSettings.width,
          height: videoMetadata?.height ?? exportSettings.height,
        });
        return;
      }

      if (sizeMode === "preset") {
        const fallbackTarget =
          CREATOR_TARGETS.find((target) => target.id === selectedCreatorTargetId) ??
          CREATOR_TARGETS[0];
        updateExportSettings({
          preset: "custom",
          sizingMode: "preset",
          resizeMode: exportSettings.resizeMode === "original" ? "fit" : exportSettings.resizeMode,
          width: fallbackTarget.width,
          height: fallbackTarget.height,
        });
        return;
      }

      updateExportSettings({
        preset: "custom",
        sizingMode: "custom",
        resizeMode: exportSettings.resizeMode === "original" ? "fit" : exportSettings.resizeMode,
      });
    },
    [
      exportSettings.height,
      exportSettings.resizeMode,
      exportSettings.width,
      selectedCreatorTargetId,
      updateExportSettings,
      videoMetadata?.height,
      videoMetadata?.width,
    ]
  );

  const handlePresetSelect = useCallback(
    (presetId: (typeof PRESETS)[number]["id"]) => {
      if (presetId === "custom") {
        applyCustomSizeMode(exportSettings.sizingMode);
        return;
      }

      updateExportSettings({ preset: presetId });
    },
    [applyCustomSizeMode, exportSettings.sizingMode, updateExportSettings]
  );

  const handleExport = useCallback(async () => {
    if (!filePath || clipSegments.length === 0 || !isDesktopRuntime()) {
      setError(t("exportModal.desktopOnly"));
      return;
    }

    if (ffmpegUnavailable) {
      setError(t("exportModal.ffmpegMissingDescription"));
      return;
    }

    if (activeTarget.width <= 0 || activeTarget.height <= 0) {
      setError(t("exportModal.invalidDimensions"));
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
        target_width: activeTarget.width,
        target_height: activeTarget.height,
        sizing_mode:
          exportSettings.preset === "custom" ? exportSettings.sizingMode : "preset",
        resize_mode: activeResizeMode,
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
      setError(t("exportModal.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  }, [
    clipSegments,
    detectionSettings.mode,
    detectionSettings.speedMultiplier,
    exportSettings.height,
    exportSettings.fileName,
    exportSettings.fps,
    exportSettings.preset,
    exportSettings.resolution,
    exportSettings.resizeMode,
    exportSettings.sizingMode,
    exportSettings.width,
    filePath,
    ffmpegStatus?.error,
    ffmpegUnavailable,
    setProcessedFilePath,
    setShowExportModal,
    t,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-surface-container-lowest/40 p-3 sm:items-center sm:p-6">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl glass-panel ghost-border shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-between px-6 pb-3 pt-6 sm:px-8 sm:pt-8 sm:pb-4">
          <h2 className="text-2xl font-bold tracking-tight text-white">{t("exportModal.title")}</h2>
          <button
            onClick={() => setShowExportModal(false)}
            className="text-on-surface-variant hover:text-white transition-colors"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
          <section className="space-y-3 sm:space-y-4">
            <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              {t("exportModal.presets")}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
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

          {exportSettings.preset === "custom" && (
            <section className="space-y-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/40 p-4 sm:space-y-5 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    {t("exportModal.customCanvas")}
                  </div>
                  <p className="mt-2 max-w-xl text-sm text-on-surface-variant leading-relaxed">
                    {t("exportModal.customCanvasDescription")}
                  </p>
                </div>
                <div className="rounded-lg border border-outline-variant/10 bg-surface-container px-4 py-3 text-right min-w-48">
                  <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                    {t("exportModal.sourceDimensions")}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-on-surface">
                    {videoMetadata ? `${videoMetadata.width} × ${videoMetadata.height}` : "—"}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("exportModal.sizeMode")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_SIZE_MODES.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      variant={exportSettings.sizingMode === option.id ? "primary" : "surface"}
                      size="sm"
                      onClick={() => applyCustomSizeMode(option.id)}
                    >
                      {t(option.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>

              {exportSettings.sizingMode === "preset" && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    {t("exportModal.creatorTargets")}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {CREATOR_TARGETS.map((target) => {
                      const selected = selectedCreatorTargetId === target.id;
                      return (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() =>
                            updateExportSettings({
                              preset: "custom",
                              sizingMode: "preset",
                              resizeMode:
                                exportSettings.resizeMode === "original"
                                  ? "fit"
                                  : exportSettings.resizeMode,
                              width: target.width,
                              height: target.height,
                            })
                          }
                          className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                            selected
                              ? "border-primary/50 bg-surface-container-highest"
                              : "border-outline-variant/10 bg-surface-container hover:border-primary-dim/30"
                          }`}
                        >
                          <div className="text-sm font-medium text-on-surface">
                            {t(target.labelKey)}
                          </div>
                          <div className="mt-1 text-[11px] text-on-surface-variant uppercase tracking-wide">
                            {t(target.descriptionKey)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {exportSettings.sizingMode === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                      {t("exportModal.width")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={exportSettings.width}
                      onChange={(event) =>
                        updateExportSettings({
                          preset: "custom",
                          sizingMode: "custom",
                          width: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2.5 px-4 text-sm"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                      {t("exportModal.height")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={exportSettings.height}
                      onChange={(event) =>
                        updateExportSettings({
                          preset: "custom",
                          sizingMode: "custom",
                          height: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2.5 px-4 text-sm"
                    />
                  </label>
                </div>
              )}

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("exportModal.resizeMode")}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {RESIZE_MODE_OPTIONS.map((option) => {
                    const disabled =
                      exportSettings.sizingMode === "original" && option.id !== "original";
                    const selected = activeResizeMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          updateExportSettings({
                            preset: "custom",
                            resizeMode: option.id,
                          })
                        }
                        className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                          selected
                            ? "border-primary/50 bg-surface-container-highest"
                            : "border-outline-variant/10 bg-surface-container hover:border-primary-dim/30"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        <div className="text-sm font-medium text-on-surface">
                          {t(option.labelKey)}
                        </div>
                        <div className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
                          {t(option.descriptionKey)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    {t("exportModal.previewTitle")}
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {t("exportModal.previewDescription")}
                  </p>
                  <div
                    className="w-full overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-lowest flex items-center justify-center"
                    style={{ aspectRatio: previewAspectRatio }}
                  >
                    {previewLoading ? (
                      <div className="px-6 py-10 text-sm text-on-surface-variant">
                        {t("exportModal.previewLoading")}
                      </div>
                    ) : previewImageSrc ? (
                      <img
                        src={previewImageSrc}
                        alt={t("exportModal.previewTitle")}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="px-6 py-10 text-sm text-on-surface-variant text-center">
                        {previewError ?? t("exportModal.previewUnavailable")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant/10 bg-surface-container p-4 space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                      {t("exportModal.outputFrame")}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-on-surface">
                      {activeTarget.width} × {activeTarget.height}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                      {t("exportModal.resizeMode")}
                    </div>
                    <div className="mt-1 text-sm font-medium text-on-surface">
                      {t(
                        RESIZE_MODE_OPTIONS.find((option) => option.id === activeResizeMode)
                          ?.labelKey ?? "exportModal.resizeModeFitLabel"
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                      {resizeModeDescription}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

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
            {exportSettings.preset !== "custom" ? (
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
                        {resolution === "1080p"
                          ? t("exportModal.fullHd")
                          : t("exportModal.ultraHd")}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-outline-variant/10 bg-surface-container-low/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("exportModal.outputFrame")}
                </div>
                <div className="text-lg font-semibold text-on-surface">
                  {activeTarget.width} × {activeTarget.height}
                </div>
                <p className="text-xs leading-relaxed text-on-surface-variant">
                  {resizeModeDescription}
                </p>
              </div>
            )}
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
                      {fps === 60 ? t("exportModal.fpsSmooth") : t("exportModal.fpsStandard")}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border-l-2 border-primary-dim bg-surface-container-low/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Icon name="info" className="text-primary-fixed text-xl" />
              <div>
                <div className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                  {t("exportModal.outputSummary")}
                </div>
                <div className="text-lg font-mono text-white">
                  {formatTime(previewDurationSeconds)}
                </div>
                <div className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                  {t("exportModal.finalSizeDependsOnContent")}
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-on-surface-variant">{t("exportModal.sourceSize")}</div>
              <div className="text-sm font-medium text-on-surface">
                {videoMetadata ? formatFileSize(videoMetadata.file_size) : "—"}
              </div>
              <div className="text-xs text-on-surface-variant mt-2">{t("exportModal.clips")}</div>
              <div className="text-sm font-medium text-on-surface">{clipSegments.length}</div>
              <div className="text-xs text-on-surface-variant mt-2">{t("exportModal.outputFrame")}</div>
              <div className="text-sm font-medium text-on-surface">
                {activeTarget.width} × {activeTarget.height}
              </div>
            </div>
          </div>

          {ffmpegUnavailable && (
            <FfmpegHelpPanel
              status={ffmpegStatus ?? null}
              title={t("exportModal.ffmpegMissingTitle")}
              description={t("exportModal.ffmpegMissingDescription")}
            />
          )}

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

        <div className="shrink-0 border-t border-outline-variant/10 bg-surface-container-high/30 px-6 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <Button variant="ghost" onClick={() => setShowExportModal(false)}>
            {t("exportModal.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={isExporting || clipSegments.length === 0 || ffmpegUnavailable}
            className="w-full px-10 sm:w-auto"
          >
            {isExporting ? `${t("exportModal.exporting")} ${exportProgress}%` : t("exportModal.exportNow")}
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
