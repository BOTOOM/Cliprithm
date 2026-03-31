import { useCallback, useMemo, useRef, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { log } from "../../lib/logger";
import {
  editedToSourceTime,
  findClipAtSourceTime,
  getTotalClipDuration,
  sourceToEditedTime,
} from "../../lib/editor";
import { formatTime } from "../../lib/utils";
import { getFileName, resolveMediaSrc } from "../../lib/media";
import { isDesktopRuntime } from "../../lib/runtime";
import { useProjectStore } from "../../stores/projectStore";
import { detectSilence, generatePreviewProxy } from "../../services/tauriCommands";
import type { ClipSegment } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import { Timeline } from "../timeline/Timeline";

export function EditorView() {
  const {
    filePath,
    videoMetadata,
    detectionResult,
    detectionSettings,
    updateDetectionSettings,
    setDetectionResult,
    previewFilePath,
    setPreviewFilePath,
    removedSegments,
    clipSegments,
    applySuggestedCuts,
    removeClipSegment,
    splitClipAtTime,
    selectedClipId,
    setSelectedClipId,
    timelineZoom,
    setTimelineZoom,
  } = useProjectStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSourceTime, setCurrentSourceTime] = useState(0);
  const [isRedetecting, setIsRedetecting] = useState(false);
  const [previewEdited, setPreviewEdited] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isGeneratingProxy, setIsGeneratingProxy] = useState(false);

  const duration = videoMetadata?.duration ?? 0;
  const fallbackClip: ClipSegment | null = useMemo(() => {
    if (duration <= 0) return null;
    return {
      id: "full-video",
      label: "Full Video",
      start: 0,
      end: duration,
      duration,
    };
  }, [duration]);

  const activeClips = clipSegments.length > 0 ? clipSegments : fallbackClip ? [fallbackClip] : [];
  const editedDuration = getTotalClipDuration(activeClips);
  const currentEditedTime = previewEdited
    ? sourceToEditedTime(currentSourceTime, activeClips)
    : currentSourceTime;

  const selectedClip =
    activeClips.find((clip) => clip.id === selectedClipId) ?? activeClips[0] ?? null;

  const gapCount = removedSegments.length;
  const estimatedDuration = editedDuration || detectionResult?.estimated_output_duration || duration;
  const videoSrc = resolveMediaSrc(previewFilePath || filePath);

  const seekSourceTime = useCallback((nextSourceTime: number) => {
    if (!videoRef.current) return;
    const bounded = Math.max(0, Math.min(duration, nextSourceTime));
    videoRef.current.currentTime = bounded;
    setCurrentSourceTime(bounded);
  }, [duration]);

  const handleSeek = useCallback(
    (timelineTime: number) => {
      const sourceTime = previewEdited
        ? editedToSourceTime(timelineTime, activeClips)
        : timelineTime;
      seekSourceTime(sourceTime);
      const clip = findClipAtSourceTime(sourceTime, activeClips);
      setSelectedClipId(clip?.id ?? activeClips[0]?.id ?? null);
    },
    [activeClips, previewEdited, seekSourceTime, setSelectedClipId]
  );

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    let sourceTime = video.currentTime;
    if (previewEdited && removedSegments.length > 0) {
      const gap = removedSegments.find(
        (segment) => sourceTime >= segment.start && sourceTime < segment.end - 0.05
      );
      if (gap) {
        video.currentTime = gap.end;
        sourceTime = gap.end;
      }
    }

    setCurrentSourceTime(sourceTime);
    const currentClip = findClipAtSourceTime(sourceTime, activeClips);
    if (currentClip && currentClip.id !== selectedClipId) {
      setSelectedClipId(currentClip.id);
    }
  };

  const handleRedetect = useCallback(async () => {
    if (!filePath || filePath.startsWith("blob:")) return;
    setIsRedetecting(true);
    try {
      const result = await detectSilence(
        filePath,
        detectionSettings.noiseThreshold,
        detectionSettings.minDuration
      );
      setDetectionResult(result);
      setPreviewEdited(true);
    } catch (err) {
      log.error("[silence]", "Re-detection failed:", err);
    } finally {
      setIsRedetecting(false);
    }
  }, [detectionSettings, filePath, setDetectionResult]);

  const handleApplySuggestedCuts = useCallback(() => {
    applySuggestedCuts();
    setPreviewEdited(true);
  }, [applySuggestedCuts]);

  const handleSplitSelected = () => {
    if (!selectedClip) return;
    splitClipAtTime(selectedClip.id, currentSourceTime);
  };

  const handleDeleteSelected = () => {
    if (!selectedClip) return;
    removeClipSegment(selectedClip.id);
  };

  const handleVideoError = useCallback(async () => {
    const video = videoRef.current;
    const errorCode = video?.error?.code ?? 0;
    const errorLabel =
      {
        1: "MEDIA_ERR_ABORTED",
        2: "MEDIA_ERR_NETWORK",
        3: "MEDIA_ERR_DECODE",
        4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      }[errorCode] ?? `UNKNOWN_${errorCode}`;

    log.error("[preview]", "Video playback failed", {
      errorCode,
      errorLabel,
      currentSrc: video?.currentSrc,
      filePath,
      previewFilePath,
    });

    if (
      !isDesktopRuntime() ||
      !filePath ||
      filePath.startsWith("blob:") ||
      previewFilePath ||
      isGeneratingProxy
    ) {
      setMediaError(
        `No se pudo reproducir el video (${errorLabel}). Revisa el códec o el contenedor del archivo.`
      );
      return;
    }

    try {
      setIsGeneratingProxy(true);
      setMediaError(
        `El WebView no pudo reproducir el archivo original (${errorLabel}). Generando un proxy compatible para el preview...`
      );
      const dataDir = await appDataDir();
      const baseName = getFileName(filePath).replace(/\.[^.]+$/, "");
      const proxyPath = `${dataDir}/previews/${Date.now()}-${baseName}.mp4`;
      const result = await generatePreviewProxy(filePath, proxyPath);
      setPreviewFilePath(result);
      setMediaError(null);
    } catch (err) {
      log.error("[preview]", "Preview proxy generation failed:", err);
      setMediaError(
        `No se pudo reproducir el video (${errorLabel}) y también falló el proxy de preview: ${String(
          err
        )}`
      );
    } finally {
      setIsGeneratingProxy(false);
    }
  }, [
    filePath,
    isGeneratingProxy,
    previewFilePath,
    setPreviewFilePath,
  ]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex items-center justify-center p-8 bg-surface-container-low relative min-h-[420px]">
            <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-surface-container-highest/75 backdrop-blur-xl px-4 py-2 rounded-full border border-outline-variant/10 shadow-2xl z-10">
              <Button variant="surface" size="sm" onClick={handleApplySuggestedCuts}>
                <Icon name="auto_fix_high" className="text-base" />
                Apply Suggested Cuts
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSplitSelected}
                disabled={!selectedClip}
              >
                <Icon name="content_cut" className="text-base" />
                Split at Playhead
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={!selectedClip || activeClips.length <= 1}
              >
                <Icon name="delete" className="text-base" />
                Remove Clip
              </Button>
            </div>

            <div className="h-full aspect-[9/16] bg-surface-container-lowest rounded-xl shadow-[0_0_100px_rgba(186,158,255,0.05)] overflow-hidden relative border border-outline-variant/10 flex items-center justify-center">
              {videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-full object-cover"
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedData={() => setMediaError(null)}
                  onError={() => void handleVideoError()}
                  controls={false}
                  playsInline
                />
              ) : (
                <div className="text-on-surface-variant text-sm px-6 text-center">
                  Importa un video para comenzar.
                </div>
              )}

              {mediaError && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-6 text-center">
                  <div>
                    <Icon
                      name={isGeneratingProxy ? "sync" : "error"}
                      className={`text-4xl mb-3 ${
                        isGeneratingProxy
                          ? "text-primary animate-spin"
                          : "text-error"
                      }`}
                    />
                    <p className="text-sm text-white leading-relaxed">{mediaError}</p>
                  </div>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                <div className="flex items-center justify-center gap-6 mb-4">
                  <button
                    onClick={() => seekSourceTime(currentSourceTime - 10)}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <Icon name="replay_10" className="text-3xl" />
                  </button>
                  <button onClick={handlePlayPause}>
                    <Icon
                      name={isPlaying ? "pause_circle" : "play_circle"}
                      className="text-white text-5xl"
                      filled
                    />
                  </button>
                  <button
                    onClick={() => seekSourceTime(currentSourceTime + 10)}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <Icon name="forward_10" className="text-3xl" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-white/80">
                  <span>{formatTime(currentEditedTime)}</span>
                  <span>{formatTime(previewEdited ? estimatedDuration : duration)}</span>
                </div>
                <div className="w-full h-1 bg-surface-container-highest rounded-full mt-2 relative overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-primary rounded-full"
                    style={{
                      width: `${(currentEditedTime / Math.max(previewEdited ? estimatedDuration : duration, 0.01)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <Timeline
            duration={previewEdited ? estimatedDuration : duration}
            currentTime={currentEditedTime}
            clips={activeClips}
            selectedClipId={selectedClip?.id ?? null}
            removedSegmentsCount={gapCount}
            zoom={timelineZoom}
            onZoomChange={setTimelineZoom}
            onSeek={handleSeek}
            onSelectClip={setSelectedClipId}
          />
        </div>

        <aside className="w-80 border-l border-outline-variant/10 bg-surface-container-high p-6 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="mb-8">
            <h2 className="text-sm font-bold tracking-widest text-on-surface uppercase mb-1">
              Silence Detection
            </h2>
            <p className="text-xs text-on-surface-variant">
              Automatically identify and remove dead air from your footage.
            </p>
          </div>

          <div className="space-y-8 flex-1">
            <Slider
              label="Threshold (dB)"
              value={detectionSettings.noiseThreshold}
              min={-60}
              max={0}
              step={1}
              displayValue={`${detectionSettings.noiseThreshold} dB`}
              onChange={(value) => updateDetectionSettings({ noiseThreshold: value })}
            />

            <Slider
              label="Min Duration (s)"
              value={detectionSettings.minDuration}
              min={0.1}
              max={3}
              step={0.1}
              displayValue={`${detectionSettings.minDuration}s`}
              onChange={(value) => updateDetectionSettings({ minDuration: value })}
            />

            <div className="pt-4 space-y-4">
              <Toggle
                label="Preview Edited Timeline"
                checked={previewEdited}
                onChange={setPreviewEdited}
              />
              <Toggle
                label="Fade Out/In"
                checked={detectionSettings.fadeEnabled}
                onChange={(value) => updateDetectionSettings({ fadeEnabled: value })}
              />
              <Toggle
                label="Detect Breath"
                checked={detectionSettings.detectBreath}
                onChange={(value) => updateDetectionSettings({ detectBreath: value })}
              />
              <div className="pt-2">
                <label className="text-xs font-semibold text-on-surface-variant mb-2 block">
                  Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateDetectionSettings({ mode: "cut" })}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                      detectionSettings.mode === "cut"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    Cut Silence
                  </button>
                  <button
                    onClick={() => updateDetectionSettings({ mode: "speed" })}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                      detectionSettings.mode === "speed"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    Time Warp
                  </button>
                </div>
              </div>

              {detectionSettings.mode === "speed" && (
                <Slider
                  label="Speed Multiplier"
                  value={detectionSettings.speedMultiplier}
                  min={1.5}
                  max={6}
                  step={0.5}
                  displayValue={`${detectionSettings.speedMultiplier}x`}
                  onChange={(value) =>
                    updateDetectionSettings({ speedMultiplier: value })
                  }
                />
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleRedetect}
              disabled={isRedetecting || !filePath || filePath.startsWith("blob:")}
            >
              {isRedetecting ? "Re-detecting..." : "Re-detect Silence"}
            </Button>

            {selectedClip && (
              <div className="p-4 bg-surface-container-highest rounded-lg border border-outline-variant/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">
                    Selected Clip
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {selectedClip.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-on-surface-variant uppercase tracking-widest text-[10px] mb-1">
                      Start
                    </div>
                    <div className="font-mono text-on-surface">
                      {formatTime(selectedClip.start)}
                    </div>
                  </div>
                  <div>
                    <div className="text-on-surface-variant uppercase tracking-widest text-[10px] mb-1">
                      End
                    </div>
                    <div className="font-mono text-on-surface">
                      {formatTime(selectedClip.end)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-on-surface-variant uppercase tracking-widest text-[10px] mb-1">
                    Duration
                  </div>
                  <div className="font-mono text-on-surface">
                    {formatTime(selectedClip.duration)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-outline-variant/10 space-y-4">
            <div className="p-4 bg-surface-container-highest rounded-lg border border-outline-variant/5">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="movie" className="text-secondary text-xl" />
                <span className="text-xs font-bold text-on-surface">
                  Clips: {activeClips.length}
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                Timeline duration goes from {formatTime(duration)} to {formatTime(estimatedDuration)}.
              </p>
            </div>
            <div className="p-4 bg-surface-container-highest rounded-lg border border-outline-variant/5">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="auto_fix_high" className="text-secondary text-xl" />
                <span className="text-xs font-bold text-on-surface">
                  Detected: {gapCount} Gaps
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                Delete clips or split at the playhead before exporting your final edit.
              </p>
            </div>
            <Button
              variant="primary"
              className="w-full py-3"
              onClick={handleApplySuggestedCuts}
              disabled={removedSegments.length === 0}
            >
              <Icon name="auto_fix_high" className="text-lg" />
              Refresh Clip Timeline
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
