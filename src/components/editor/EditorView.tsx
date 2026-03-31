import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { log } from "../../lib/logger";
import {
  editedToSourceTime,
  findClipAtSourceTime,
  getTotalClipDuration,
  sourceToEditedTime,
} from "../../lib/editor";
import { formatTime } from "../../lib/utils";
import { getFileName, mediaServerUrl } from "../../lib/media";
import { useI18n } from "../../lib/i18n";
import { isDesktopRuntime } from "../../lib/runtime";
import { useProjectStore } from "../../stores/projectStore";
import {
  detectSilence,
  generatePreviewProxy,
} from "../../services/tauriCommands";
import type { ClipSegment } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import { Tooltip } from "../ui/Tooltip";
import { DetectionTimeline } from "../timeline/DetectionTimeline";
import { Timeline } from "../timeline/Timeline";

export function EditorView() {
  const { t } = useI18n();
  const {
    currentView,
    setView,
    filePath,
    videoMetadata,
    detectionResult,
    detectionSettings,
    updateDetectionSettings,
    setDetectionResult,
    previewFilePath,
    setPreviewFilePath,
    previewMode,
    setPreviewMode,
    mediaServerPort,
    removedSegments,
    clipSegments,
    applySuggestedCuts,
    removeClipSegment,
    splitClipAtTime,
    selectedClipId,
    setSelectedClipId,
    timelineZoom,
    setTimelineZoom,
    canUndo,
    undoLastEdit,
  } = useProjectStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSourceTime, setCurrentSourceTime] = useState(0);
  const [isRedetecting, setIsRedetecting] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isGeneratingSourceProxy, setIsGeneratingSourceProxy] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [proxyRetryCount, setProxyRetryCount] = useState(0);
  const lastDetectedSignatureRef = useRef<string | null>(null);

  const duration = videoMetadata?.duration ?? 0;
  const isDetectionReview = currentView === "detection";
  const fallbackClip: ClipSegment | null = useMemo(() => {
    if (duration <= 0) return null;
    return {
      id: "full-video",
      label: t("detection.fullVideo"),
      start: 0,
      end: duration,
      duration,
    };
  }, [duration, t]);

  const activeClips = clipSegments.length > 0 ? clipSegments : fallbackClip ? [fallbackClip] : [];
  const editedDuration = getTotalClipDuration(activeClips);
  const isEditedPreviewMode = currentView === "editor" && previewMode === "edited";
  const currentEditedTime =
    currentView === "editor"
      ? sourceToEditedTime(currentSourceTime, activeClips)
      : currentSourceTime;

  const selectedClip =
    activeClips.find((clip) => clip.id === selectedClipId) ?? activeClips[0] ?? null;

  const gapCount = removedSegments.length;
  const estimatedDuration = editedDuration || detectionResult?.estimated_output_duration || duration;

  // Video source: use local HTTP server for streaming with Range request support
  const videoSrc = useMemo(() => {
    if (!mediaServerPort) return "";
    const path = previewFilePath || filePath;
    if (!path || path.startsWith("blob:")) return "";
    return mediaServerUrl(mediaServerPort, path);
  }, [mediaServerPort, previewFilePath, filePath]);

  const isPreviewBusy =
    Boolean(videoSrc) && (!isVideoReady || isGeneratingSourceProxy);

  const detectionSignature = JSON.stringify({
    noiseThreshold: detectionSettings.noiseThreshold,
    minDuration: detectionSettings.minDuration,
    detectBreath: detectionSettings.detectBreath,
  });

  useEffect(() => {
    setIsVideoReady(false);
  }, [videoSrc]);

  useEffect(() => {
    setProxyRetryCount(0);
  }, [filePath]);

  // Undo keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey;
      if (!isUndoShortcut || !canUndo) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      undoLastEdit();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, undoLastEdit]);

  // Seek to a source time in the video element
  const seekSourceTimeSafely = useCallback(
    (nextSourceTime: number, options?: { resumeAfterSeek?: boolean }) => {
      const video = videoRef.current;
      if (!video) return;

      const resumeAfterSeek = options?.resumeAfterSeek ?? true;
      const bounded = Math.max(0, Math.min(duration, nextSourceTime));
      const wasPlaying = !video.paused;
      if (wasPlaying || !resumeAfterSeek) {
        video.pause();
        setIsPlaying(false);
      }

      video.currentTime = bounded;
      setCurrentSourceTime(bounded);

      if (resumeAfterSeek && wasPlaying) {
        window.setTimeout(() => {
          void video.play().catch((error) => {
            log.warn("[preview]", "Failed to resume after seek:", error);
          });
        }, 40);
      }
    },
    [duration]
  );

  // Seek using edited timeline time → convert to source time
  const seekEditedTimeSafely = useCallback(
    (nextEditedTime: number, options?: { resumeAfterSeek?: boolean }) => {
      const sourceTime = editedToSourceTime(nextEditedTime, activeClips);
      seekSourceTimeSafely(sourceTime, options);
    },
    [activeClips, seekSourceTimeSafely]
  );

  const handleSeek = useCallback(
    (timelineTime: number) => {
      const sourceTime = editedToSourceTime(timelineTime, activeClips);
      seekEditedTimeSafely(timelineTime, { resumeAfterSeek: false });
      const clip = findClipAtSourceTime(sourceTime, activeClips);
      setSelectedClipId(clip?.id ?? activeClips[0]?.id ?? null);
    },
    [activeClips, seekEditedTimeSafely, setSelectedClipId]
  );

  const handleDetectionSeek = useCallback(
    (timelineTime: number) => {
      seekSourceTimeSafely(timelineTime, { resumeAfterSeek: false });
      const clip = findClipAtSourceTime(timelineTime, activeClips);
      setSelectedClipId(clip?.id ?? activeClips[0]?.id ?? null);
    },
    [activeClips, seekSourceTimeSafely, setSelectedClipId]
  );

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  // Clip-based playback: in edited mode, skip silence gaps automatically
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const sourceTime = video.currentTime;
    setCurrentSourceTime(sourceTime);

    // In edited mode, skip over silence gaps during playback
    if (isEditedPreviewMode && !video.paused) {
      const currentClip = findClipAtSourceTime(sourceTime, activeClips);
      if (currentClip) {
        // Check if we've passed the end of the current clip
        if (sourceTime >= currentClip.end - 0.05) {
          const clipIndex = activeClips.indexOf(currentClip);
          const nextClip = activeClips[clipIndex + 1];
          if (nextClip) {
            video.currentTime = nextClip.start;
            return;
          }
          // End of all clips
          video.pause();
          setIsPlaying(false);
          return;
        }
      } else {
        // We're in a silence gap — jump to the next clip
        const nextClip = activeClips.find((c) => c.start > sourceTime);
        if (nextClip) {
          video.currentTime = nextClip.start;
          return;
        }
        video.pause();
        setIsPlaying(false);
        return;
      }
    }

    const clip = findClipAtSourceTime(sourceTime, activeClips);
    if (clip && clip.id !== selectedClipId) {
      setSelectedClipId(clip.id);
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
      lastDetectedSignatureRef.current = JSON.stringify({
        noiseThreshold: detectionSettings.noiseThreshold,
        minDuration: detectionSettings.minDuration,
        detectBreath: detectionSettings.detectBreath,
      });
      setPreviewMode("source");
      setView("detection");
    } catch (err) {
      log.error("[silence]", "Re-detection failed:", err);
    } finally {
      setIsRedetecting(false);
    }
  }, [detectionSettings, filePath, setDetectionResult, setPreviewMode, setView]);

  useEffect(() => {
    if (!isDetectionReview || !filePath || filePath.startsWith("blob:")) {
      return;
    }

    if (lastDetectedSignatureRef.current === null) {
      lastDetectedSignatureRef.current = detectionSignature;
      return;
    }

    if (lastDetectedSignatureRef.current === detectionSignature) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void handleRedetect();
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [detectionSignature, filePath, handleRedetect, isDetectionReview]);

  const handleApplySuggestedCuts = useCallback(() => {
    applySuggestedCuts();
    setPreviewMode("edited");
    setView("editor");
  }, [applySuggestedCuts, setPreviewMode, setView]);

  const handleSplitSelected = () => {
    if (!selectedClip) return;
    splitClipAtTime(selectedClip.id, currentSourceTime);
  };

  const handleDeleteSelected = () => {
    if (!selectedClip) return;
    removeClipSegment(selectedClip.id);
  };

  const handleContinueToEditor = () => {
    applySuggestedCuts();
    setPreviewMode("edited");
    setView("editor");
  };

  const jumpBy = (deltaSeconds: number) => {
    const baseTime = currentView === "editor" ? currentEditedTime : currentSourceTime;
    const maxTime = currentView === "editor" ? estimatedDuration : duration;
    const nextTime = Math.max(0, Math.min(maxTime, baseTime + deltaSeconds));
    if (currentView === "editor") {
      seekEditedTimeSafely(nextTime);
      return;
    }

    seekSourceTimeSafely(nextTime);
  };

  // Handle video playback error — generate H.264 proxy if codec unsupported
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

    // Already have a proxy that failed — don't retry endlessly
    if (previewFilePath || proxyRetryCount >= 1) {
      setMediaError(t("detection.cannotPlay", { errorLabel }));
      return;
    }

    // First error on original file — try generating an H.264 proxy
    if (!isDesktopRuntime() || !filePath || filePath.startsWith("blob:") || isGeneratingSourceProxy) {
      setMediaError(t("detection.cannotPlay", { errorLabel }));
      return;
    }

    try {
      setIsGeneratingSourceProxy(true);
      setMediaError(t("detection.cannotPlayOriginal", { errorLabel }));
      const dataDir = await appDataDir();
      const baseName = getFileName(filePath).replace(/\.[^.]+$/, "");
      const proxyPath = `${dataDir}/previews/${Date.now()}-${baseName}.mp4`;
      const result = await generatePreviewProxy(filePath, proxyPath);
      setProxyRetryCount((count) => count + 1);
      setPreviewFilePath(result);
      setMediaError(null);
    } catch (err) {
      log.error("[preview]", "Proxy generation failed:", err);
      setMediaError(t("detection.cannotPlayWithProxy", { errorLabel, error: String(err) }));
    } finally {
      setIsGeneratingSourceProxy(false);
    }
  }, [
    filePath,
    isGeneratingSourceProxy,
    previewFilePath,
    proxyRetryCount,
    setPreviewFilePath,
    t,
  ]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <div className="flex-1 flex min-h-0 min-w-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          {isPreviewBusy && (
            <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-sm flex items-center justify-center p-6 text-center">
              <div className="max-w-sm">
                <Icon name="progress_activity" className="text-4xl text-primary animate-spin mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  {isEditedPreviewMode
                    ? t("detection.updatingEditedPreviewTitle")
                    : t("detection.loadingPreviewTitle")}
                </h3>
                <p className="text-sm text-white/70 leading-relaxed">
                  {isEditedPreviewMode
                    ? t("detection.updatingEditedPreviewDescription")
                    : t("detection.loadingPreviewDescription")}
                </p>
              </div>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center p-8 bg-surface-container-low relative min-h-[420px]">
             <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-surface-container-highest/75 backdrop-blur-xl px-4 py-2 rounded-full border border-outline-variant/10 shadow-2xl z-10">
               {isDetectionReview ? (
                 <Button variant="primary" size="sm" onClick={handleContinueToEditor}>
                   <Icon name="arrow_forward" className="text-base" />
                   {t("detection.nextEditor")}
                 </Button>
               ) : (
                 <>
                   <Button variant="surface" size="sm" onClick={handleApplySuggestedCuts}>
                     <Icon name="auto_fix_high" className="text-base" />
                     {t("detection.applySuggestedCuts")}
                   </Button>
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={undoLastEdit}
                     disabled={!canUndo}
                    >
                      <Icon name="undo" className="text-base" />
                      {t("detection.undo")}
                    </Button>
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={handleSplitSelected}
                     disabled={!selectedClip}
                    >
                      <Icon name="content_cut" className="text-base" />
                      {t("detection.splitAtPlayhead")}
                    </Button>
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={handleDeleteSelected}
                     disabled={!selectedClip || activeClips.length <= 1}
                    >
                      <Icon name="delete" className="text-base" />
                      {t("detection.removeClip")}
                    </Button>
                 </>
               )}
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
                  onLoadStart={() => setIsVideoReady(false)}
                  onLoadedData={() => {
                    if (videoRef.current) {
                      const targetTime =
                        currentView === "editor"
                          ? editedToSourceTime(currentEditedTime, activeClips)
                          : currentSourceTime;
                      if (Math.abs(videoRef.current.currentTime - targetTime) > 0.15) {
                        videoRef.current.currentTime = targetTime;
                      }
                    }
                    setMediaError(null);
                    setIsVideoReady(true);
                  }}
                  onCanPlay={() => setIsVideoReady(true)}
                  onError={() => void handleVideoError()}
                  controls={false}
                  preload="auto"
                  playsInline
                />
              ) : (
                <div className="text-on-surface-variant text-sm px-6 text-center">
                  {isGeneratingSourceProxy
                    ? t("detection.proxyLoading")
                    : t("detection.importToBegin")}
                </div>
              )}

              {mediaError && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-6 text-center">
                  <div>
                    <Icon
                      name={isGeneratingSourceProxy ? "sync" : "error"}
                      className={`text-4xl mb-3 ${
                        isGeneratingSourceProxy
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
                     onClick={() => jumpBy(-10)}
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
                     onClick={() => jumpBy(10)}
                     className="text-white/80 hover:text-white transition-colors"
                   >
                    <Icon name="forward_10" className="text-3xl" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-white/80">
                   <span>{formatTime(currentEditedTime)}</span>
                  <span>{formatTime(currentView === "editor" ? estimatedDuration : duration)}</span>
                 </div>
                 <div className="w-full h-1 bg-surface-container-highest rounded-full mt-2 relative overflow-hidden">
                   <div
                     className="absolute top-0 left-0 h-full bg-primary rounded-full"
                     style={{
                       width: `${(currentEditedTime / Math.max(currentView === "editor" ? estimatedDuration : duration, 0.01)) * 100}%`,
                     }}
                   />
                 </div>
               </div>
             </div>
           </div>

          {isDetectionReview ? (
            <DetectionTimeline
              duration={duration}
              currentTime={currentSourceTime}
              segments={removedSegments}
              onSeek={handleDetectionSeek}
            />
          ) : (
            <Timeline
              duration={estimatedDuration}
              currentTime={currentEditedTime}
              clips={activeClips}
              selectedClipId={selectedClip?.id ?? null}
              removedSegmentsCount={gapCount}
              zoom={timelineZoom}
              onZoomChange={setTimelineZoom}
              onSeek={handleSeek}
              onSelectClip={setSelectedClipId}
            />
          )}
        </div>

        <aside className="w-80 border-l border-outline-variant/10 bg-surface-container-high p-6 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="mb-8">
            <h2 className="text-sm font-bold tracking-widest text-on-surface uppercase mb-1">
              {t("app.detectionReview")}
            </h2>
            <p className="text-xs text-on-surface-variant">
              {isDetectionReview
                ? t("detection.detectedGapsDescription")
                : t("detection.gapsDescription")}
            </p>
          </div>

          <div className="space-y-8 flex-1">
            <Slider
              label={t("detection.threshold")}
              value={detectionSettings.noiseThreshold}
              min={-60}
              max={0}
              step={1}
              tooltip={t("detection.thresholdTooltip")}
              displayValue={`${detectionSettings.noiseThreshold} dB`}
              onChange={(value) => updateDetectionSettings({ noiseThreshold: value })}
            />

            <Slider
              label={t("detection.minDuration")}
              value={detectionSettings.minDuration}
              min={0.1}
              max={3}
              step={0.1}
              tooltip={t("detection.minDurationTooltip")}
              displayValue={`${detectionSettings.minDuration}s`}
              onChange={(value) => updateDetectionSettings({ minDuration: value })}
            />

            <div className="pt-4 space-y-4">
              {!isDetectionReview && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-on-surface-variant">
                      {t("detection.previewModeLabel")}
                    </label>
                    <Tooltip
                      content={
                        previewMode === "edited"
                          ? t("detection.editedPreviewTooltip")
                          : t("detection.sourcePreviewTooltip")
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPreviewMode("edited")}
                      className={`py-2 text-xs font-bold rounded-md transition-all ${
                        previewMode === "edited"
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      {t("detection.editedPreview")}
                    </button>
                    <button
                      onClick={() => setPreviewMode("source")}
                      className={`py-2 text-xs font-bold rounded-md transition-all ${
                        previewMode === "source"
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      {t("detection.sourcePreview")}
                    </button>
                  </div>
                </div>
              )}
                <Toggle
                  label={t("detection.fade")}
                  checked={detectionSettings.fadeEnabled}
                 onChange={(value) => updateDetectionSettings({ fadeEnabled: value })}
                 tooltip={t("detection.fadeTooltip")}
               />
               <Toggle
                 label={t("detection.detectBreath")}
                 checked={detectionSettings.detectBreath}
                 onChange={(value) => updateDetectionSettings({ detectBreath: value })}
                 tooltip={t("detection.detectBreathTooltip")}
               />
               <div className="pt-2">
                 <div className="flex items-center gap-2 mb-2">
                   <label className="text-xs font-semibold text-on-surface-variant">
                     {t("detection.mode")}
                   </label>
                   <Tooltip content={t("detection.modeTooltip")} />
                 </div>
                 <div className="flex gap-2">
                  <button
                    onClick={() => updateDetectionSettings({ mode: "cut" })}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                        detectionSettings.mode === "cut"
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-highest text-on-surface-variant"
                     }`}
                     title={t("detection.cutSilence")}
                   >
                     {t("detection.cutSilence")}
                    </button>
                  <button
                    onClick={() => updateDetectionSettings({ mode: "speed" })}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                        detectionSettings.mode === "speed"
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-highest text-on-surface-variant"
                     }`}
                     title={t("detection.timeWarp")}
                   >
                     {t("detection.timeWarp")}
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
              {isRedetecting ? t("detection.reDetecting") : t("detection.reDetect")}
            </Button>

            {!isDetectionReview && selectedClip && (
              <div className="p-4 bg-surface-container-highest rounded-lg border border-outline-variant/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">
                    {t("detection.selectedClip")}
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {selectedClip.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                      <div className="text-on-surface-variant uppercase tracking-widest text-[10px] mb-1">
                        {t("detection.start")}
                      </div>
                    <div className="font-mono text-on-surface">
                      {formatTime(selectedClip.start)}
                    </div>
                  </div>
                  <div>
                      <div className="text-on-surface-variant uppercase tracking-widest text-[10px] mb-1">
                        {t("detection.end")}
                      </div>
                    <div className="font-mono text-on-surface">
                      {formatTime(selectedClip.end)}
                    </div>
                  </div>
                </div>
                <div>
                    <div className="text-on-surface-variant uppercase tracking-widest text-[10px] mb-1">
                      {t("detection.duration")}
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
                  {isDetectionReview
                    ? t("detection.originalTimeline")
                    : t("detection.clips", { count: activeClips.length })}
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                {isDetectionReview
                  ? t("detection.originalTimelineDescription")
                  : t("detection.clipsDescription", {
                      source: formatTime(duration),
                      edited: formatTime(estimatedDuration),
                    })}
              </p>
            </div>
            <div className="p-4 bg-surface-container-highest rounded-lg border border-outline-variant/5">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="auto_fix_high" className="text-secondary text-xl" />
                <span className="text-xs font-bold text-on-surface">
                  {t("detection.detectedGaps", { count: gapCount })}
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                {isDetectionReview
                  ? t("detection.detectedGapsDescription")
                  : t("detection.gapsDescription")}
              </p>
            </div>
            {isDetectionReview ? (
              <Button
                variant="primary"
                className="w-full py-3"
                onClick={handleContinueToEditor}
                disabled={removedSegments.length === 0}
              >
                <Icon name="arrow_forward" className="text-lg" />
                {t("detection.continueEditor")}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full py-3"
                onClick={handleApplySuggestedCuts}
                disabled={removedSegments.length === 0}
              >
                <Icon name="auto_fix_high" className="text-lg" />
                {t("detection.refreshTimeline")}
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
