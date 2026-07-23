import { useEffect, useMemo, useRef, useState } from "react";
import { appDataDir } from "@tauri-apps/api/path";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { getFileName, mediaServerUrl, resolveMediaSrc } from "../../lib/media";
import { formatTime } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import {
  getAsset,
  getPositionedClips,
  getTimelineDuration,
  timelineTimeToSourceTime,
} from "../../lib/editor/timeline";
import { stableHash } from "../../lib/editor/preview";
import { useProjectStore } from "../../stores/projectStore";
import {
  authorizeMediaPath,
  cancelProjectRender,
  detectSilence,
  generateProjectPreview,
  getVideoMetadata,
} from "../../services/tauriCommands";
import { isDesktopRuntime } from "../../lib/runtime";
import type { MediaAsset, SilenceSegment } from "../../types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Toggle } from "../ui/Toggle";
import { Tooltip } from "../ui/Tooltip";

const MIN_ZOOM = 4;
const MAX_ZOOM = 40;
const PRIMARY_TRACK_ID = "track-video-1";

function assetInput(asset: MediaAsset): Omit<MediaAsset, "id" | "kind"> & Partial<Pick<MediaAsset, "id" | "kind">> {
  return {
    path: asset.path,
    name: asset.name,
    metadata: asset.metadata,
    thumbnailPath: asset.thumbnailPath,
    sourceFingerprint: asset.sourceFingerprint,
    kind: asset.kind,
  };
}

export function ProjectEditorView() {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRequestRef = useRef(0);
  const previewJobIdRef = useRef<string | null>(null);
  const previewRunningRef = useRef(false);
  const previewQueuedRef = useRef(false);
  const sourceAdvanceRef = useRef(false);
  const [previewTick, setPreviewTick] = useState(0);
  const {
    timelineProject,
    projectId,
    editedPreviewFilePath,
    setEditedPreviewFilePath,
    selectedClipId,
    dispatchEditorAction,
    detectionSettings,
    updateDetectionSettings,
    timelineZoom,
    setTimelineZoom,
    canUndoTimeline,
    playhead,
    progress,
    setProgress,
  } = useProjectStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewNotice, setPreviewNotice] = useState("");
  const [candidateRanges, setCandidateRanges] = useState<{
    id: string;
    projectRevision: number;
    status: "reviewable";
    ranges: Array<{ clipId: string; segments: SilenceSegment[] }>;
  } | null>(null);
  const [analysisScope, setAnalysisScope] = useState<"clip" | "timeline">("clip");
  const [analysisScopeOpen, setAnalysisScopeOpen] = useState(false);
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [authorizedMediaPath, setAuthorizedMediaPath] = useState<string | null>(null);

  const positionedClips = useMemo(
    () => (timelineProject ? getPositionedClips(timelineProject, PRIMARY_TRACK_ID) : []),
    [timelineProject]
  );
  const duration = timelineProject ? getTimelineDuration(timelineProject, PRIMARY_TRACK_ID) : 0;
  const selectedClip = positionedClips.find((clip) => clip.id === selectedClipId) ?? positionedClips[0] ?? null;
  const selectedAsset = selectedClip && timelineProject ? getAsset(timelineProject, selectedClip.assetId) : null;
  const mediaPort = useProjectStore((state) => state.mediaServerPort);
  const mediaToken = useProjectStore((state) => state.mediaServerToken);
  const mediaPath = editedPreviewFilePath || selectedAsset?.path || null;

  useEffect(() => {
    let cancelled = false;
    setAuthorizedMediaPath(null);
    if (!mediaPath || !isDesktopRuntime()) return;
    void authorizeMediaPath(mediaPath)
      .then(() => {
        if (!cancelled) setAuthorizedMediaPath(mediaPath);
      })
      .catch((error) => console.warn("[media-server] Failed to authorize media path:", error));
    return () => {
      cancelled = true;
    };
  }, [mediaPath]);

  const sourceVideoSrc = selectedAsset
    ? !isDesktopRuntime() || selectedAsset.path.startsWith("blob:")
      ? resolveMediaSrc(selectedAsset.path)
      : authorizedMediaPath === selectedAsset.path && mediaPort && mediaToken
        ? mediaServerUrl(mediaPort, mediaToken, selectedAsset.path)
        : ""
    : "";
  const videoSrc = editedPreviewFilePath
    ? !isDesktopRuntime() || editedPreviewFilePath.startsWith("blob:")
      ? resolveMediaSrc(editedPreviewFilePath)
      : authorizedMediaPath === editedPreviewFilePath && mediaPort && mediaToken
        ? mediaServerUrl(mediaPort, mediaToken, editedPreviewFilePath)
        : ""
    : sourceVideoSrc;
  const timelineWidth = Math.max(640, duration * timelineZoom);

  useEffect(() => {
    dispatchEditorAction({ type: "selection.setPlayhead", timelineTime: Math.min(playhead, duration) });
  }, [dispatchEditorAction, duration]);

  useEffect(() => {
    if (
      analysisScope === "clip" &&
      candidateRanges &&
      candidateRanges.ranges[0]?.clipId !== selectedClipId
    ) {
      setCandidateRanges(null);
    }
  }, [analysisScope, candidateRanges, selectedClipId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;

    video.playbackRate = editedPreviewFilePath ? 1 : selectedClip.speed;
    if (editedPreviewFilePath) return;

    const source = selectedClip.sourceStart;
    if (Math.abs(video.currentTime - source) > 0.15) {
      video.currentTime = source;
    }
  }, [editedPreviewFilePath, selectedClip]);

  useEffect(() => {
    if (!timelineProject || !isDesktopRuntime() || !projectId) return;
    if (previewRunningRef.current) {
      previewQueuedRef.current = true;
      return;
    }

    const requestId = previewRequestRef.current + 1;
    const jobId = `project-preview-${projectId}-${timelineProject.revision}-${requestId}`;
    previewRequestRef.current = requestId;
    setEditedPreviewFilePath(null);
    const timer = window.setTimeout(() => {
      previewRunningRef.current = true;
      previewJobIdRef.current = jobId;
      previewQueuedRef.current = false;
      void (async () => {
        try {
          const dataDir = await appDataDir();
          const firstAsset = timelineProject.assets.find((asset) => asset.metadata);
          const sourceWidth = firstAsset?.metadata?.width ?? 720;
          const sourceHeight = firstAsset?.metadata?.height ?? 720;
          const scale = Math.min(1, 720 / Math.max(sourceWidth, sourceHeight));
          const targetWidth = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2);
          const targetHeight = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2);
          const sourceFingerprint = timelineProject.assets
            .map((asset) => `${asset.id}:${asset.sourceFingerprint ?? asset.path}`)
            .sort()
            .join("|");
          const outputPath = `${dataDir}/previews/project-${projectId}-revision-${timelineProject.revision}-${stableHash(sourceFingerprint)}.mp4`;
          const result = await generateProjectPreview({
            outputPath,
            targetWidth,
            targetHeight,
            jobId,
            projectId,
            clips: positionedClips.flatMap((clip) => {
              const asset = getAsset(timelineProject, clip.assetId);
              return asset
                ? [{
                    inputPath: asset.path,
                    sourceStart: clip.sourceStart,
                    sourceEnd: clip.sourceEnd,
                    speed: clip.speed,
                    fps: asset.metadata?.fps ?? 30,
                    width: asset.metadata?.width ?? targetWidth,
                    height: asset.metadata?.height ?? targetHeight,
                    hasAudio: asset.metadata?.has_audio ?? false,
                  }]
                : [];
            }),
          });
          if (previewRequestRef.current === requestId) {
            setEditedPreviewFilePath(result);
            setPreviewNotice(t("editor.previewReady"));
          }
        } catch {
          if (previewRequestRef.current === requestId) {
            setPreviewNotice(t("editor.previewUnavailable"));
          }
        } finally {
          if (previewJobIdRef.current === jobId) {
            previewJobIdRef.current = null;
            previewRunningRef.current = false;
          }
          if (previewQueuedRef.current) {
            previewQueuedRef.current = false;
            setPreviewTick((current) => current + 1);
          }
        }
      })();
    }, 900);
    return () => {
      window.clearTimeout(timer);
      if (previewJobIdRef.current === jobId) {
        void cancelProjectRender(jobId).catch(() => undefined);
      }
    };
  }, [positionedClips, previewTick, projectId, setEditedPreviewFilePath, t, timelineProject]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatchEditorAction({ type: "history.undo" });
      } else if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        dispatchEditorAction({ type: "history.redo" });
      } else if (event.key.toLowerCase() === "s" && selectedClip) {
        event.preventDefault();
        dispatchEditorAction({ type: "clip.splitAtPlayhead", clipId: selectedClip.id, timelineTime: playhead });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedClip) return;
        event.preventDefault();
        dispatchEditorAction({ type: "clip.delete", clipId: selectedClip.id });
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function advanceSourceClip() {
    if (editedPreviewFilePath || !selectedClip) return false;
    if (sourceAdvanceRef.current) return true;
    const selectedIndex = positionedClips.findIndex((clip) => clip.id === selectedClip.id);
    const nextClip = positionedClips[selectedIndex + 1];
    if (!nextClip) return false;

    sourceAdvanceRef.current = true;
    window.setTimeout(() => {
      sourceAdvanceRef.current = false;
    }, 250);
    dispatchEditorAction({ type: "selection.selectClip", clipId: nextClip.id });
    dispatchEditorAction({ type: "selection.setPlayhead", timelineTime: nextClip.timelineStart });
    return true;
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setPreviewNotice(t("editor.previewUnavailable")));
    } else {
      video.pause();
    }
  }

  function updateSelectedSpeed(speed: number) {
    if (!selectedClip) return;
    dispatchEditorAction({
      type: "clip.setSpeed",
      clipId: selectedClip.id,
      speed: Math.min(32, Math.max(0.25, speed)),
    });
  }

  function seekTimeline(time: number) {
    if (!timelineProject) return;
    const mapped = timelineTimeToSourceTime(timelineProject, time);
    if (!mapped) return;
    dispatchEditorAction({ type: "selection.setPlayhead", timelineTime: time });
    dispatchEditorAction({ type: "selection.selectClip", clipId: mapped.clip.id });
    if (videoRef.current) {
      videoRef.current.currentTime = editedPreviewFilePath ? time : mapped.sourceTime;
    }
  }

  async function handleDetectSilence() {
    if (!timelineProject || !selectedClip) return;
    setCandidateBusy(true);
    setPreviewNotice("");
    setProgress({ percent: 0, stage: "analyzing", message: "" });
    const analysisRevision = timelineProject.revision;
    try {
      const clipsToAnalyze = analysisScope === "timeline" ? positionedClips : [selectedClip];
      const analyzedDuration = clipsToAnalyze.reduce(
        (total, clip) => total + clip.timelineDuration,
        0
      );
      if (
        analysisScope === "timeline" &&
        (analyzedDuration >= 120 || clipsToAnalyze.length >= 50) &&
        !(await confirm(t("editor.analysisLongWarning")))
      ) {
        return;
      }
      const candidates: Array<{ clipId: string; segments: SilenceSegment[] }> = [];
      for (const clip of clipsToAnalyze) {
        const asset = getAsset(timelineProject, clip.assetId);
        if (!asset?.metadata?.has_audio) continue;
        const result = await detectSilence(
          asset.path,
          detectionSettings.noiseThreshold,
          detectionSettings.minDuration,
          clip.sourceStart,
          clip.sourceEnd
        );
        const segments = result.segments
          .filter((segment) => segment.end > clip.sourceStart && segment.start < clip.sourceEnd)
          .map((segment) => ({
            start: Math.max(clip.sourceStart, segment.start),
            end: Math.min(clip.sourceEnd, segment.end),
            duration: Math.min(clip.sourceEnd, segment.end) - Math.max(clip.sourceStart, segment.start),
          }))
          .filter((segment) => segment.duration >= 0.08);
        if (segments.length > 0) candidates.push({ clipId: clip.id, segments });
      }
      if (useProjectStore.getState().timelineProject?.revision !== analysisRevision) {
        setPreviewNotice(t("editor.analysisStale"));
        return;
      }
      setCandidateRanges({
        id: `candidate-${analysisRevision}-${Date.now()}`,
        projectRevision: analysisRevision,
        status: "reviewable",
        ranges: candidates,
      });
    } catch {
      setPreviewNotice(t("editor.analysisUnavailable"));
    } finally {
      setCandidateBusy(false);
    }
  }

  async function handleAddVideo() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm"] }],
    });
    if (typeof selected !== "string") return;
    try {
      const metadata = await getVideoMetadata(selected);
      const asset: MediaAsset = {
        id: `asset-${Date.now()}`,
        kind: "video",
        path: selected,
        name: getFileName(selected),
        metadata,
        thumbnailPath: null,
        sourceFingerprint: `${metadata.file_size}:${metadata.duration}:${metadata.codec}`,
      };
      dispatchEditorAction({ type: "asset.addVideo", asset: assetInput(asset) });
    } catch {
      setPreviewNotice(t("editor.mediaImportFailed"));
    }
  }

  if (!timelineProject || !selectedClip) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface-container-low text-on-surface-variant">
        {t("editor.emptyProject")}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-surface text-on-surface">
      <div className="flex min-h-12 items-center justify-between gap-3 bg-surface-container px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("app.editor")}</span>
          <span className="truncate text-xs text-on-surface-variant">{selectedAsset?.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip variant="wrap" delay={2000} content={t("editor.undoTooltip")}>
            <Button variant="ghost" size="sm" onClick={() => dispatchEditorAction({ type: "history.undo" })} disabled={!canUndoTimeline} aria-label={t("editor.undo")}>
              <Icon name="undo" className="text-base" />
            </Button>
          </Tooltip>
          <Tooltip variant="wrap" delay={2000} content={t("editor.redoTooltip")}>
            <Button variant="ghost" size="sm" onClick={() => dispatchEditorAction({ type: "history.redo" })} aria-label={t("editor.redo")}>
              <Icon name="redo" className="text-base" />
            </Button>
          </Tooltip>
          <Tooltip variant="wrap" delay={2000} content={t("editor.addVideoTooltip")}>
            <Button variant="surface" size="sm" onClick={() => void handleAddVideo()}>
              <Icon name="video_call" className="text-base" />
              {t("editor.addVideo")}
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 flex-col gap-3 border-r border-outline-variant/10 bg-surface-container p-3 lg:flex">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{t("editor.media")}</span>
            <Icon name="video_library" className="text-sm text-primary" />
          </div>
          <div className="space-y-2 overflow-y-auto custom-scrollbar">
            {timelineProject.assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => {
                  const clip = positionedClips.find((candidate) => candidate.assetId === asset.id);
                  if (clip) dispatchEditorAction({ type: "selection.selectClip", clipId: clip.id });
                }}
                className={`flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors ${
                  asset.id === selectedAsset?.id
                    ? "bg-surface-container-highest text-on-surface"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                <div className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-lowest">
                  {asset.thumbnailPath ? <img src={resolveMediaSrc(asset.thumbnailPath)} alt="" className="h-full w-full object-cover" /> : <Icon name="movie" className="text-sm" />}
                </div>
                <span className="truncate text-[11px]">{asset.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-container-low p-5">
            <div className="relative flex h-full max-h-[min(66vh,720px)] max-w-full items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest shadow-2xl" style={{ aspectRatio: selectedAsset?.metadata ? `${selectedAsset.metadata.width} / ${selectedAsset.metadata.height}` : "9 / 16" }}>
              {videoSrc ? (
                <video
                  ref={videoRef}
                  key={videoSrc}
                  src={videoSrc}
                  className="h-full w-full object-contain"
                  preload="metadata"
                  playsInline
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedMetadata={(event) => {
                    event.currentTarget.playbackRate = editedPreviewFilePath ? 1 : selectedClip.speed;
                    event.currentTarget.currentTime = editedPreviewFilePath
                      ? playhead
                      : selectedClip.sourceStart;
                    if (isPlaying && event.currentTarget.paused) {
                      void event.currentTarget.play().catch(() => setPreviewNotice(t("editor.previewUnavailable")));
                    }
                  }}
                  onTimeUpdate={(event) => {
                    if (editedPreviewFilePath) {
                      const nextTime = event.currentTarget.currentTime;
                      dispatchEditorAction({ type: "selection.setPlayhead", timelineTime: nextTime });
                      const nextClip = positionedClips.find(
                        (clip) => nextTime >= clip.timelineStart && nextTime < clip.timelineEnd
                      );
                      if (nextClip && nextClip.id !== selectedClipId) {
                        dispatchEditorAction({ type: "selection.selectClip", clipId: nextClip.id });
                      }
                      return;
                    }

                    const sourceTime = event.currentTarget.currentTime;
                    const sourceClip = positionedClips.find(
                      (clip) =>
                        clip.assetId === selectedAsset?.id &&
                        sourceTime >= clip.sourceStart &&
                        sourceTime < clip.sourceEnd
                    );
                    if (sourceClip) {
                      if (sourceClip.id !== selectedClipId) {
                        dispatchEditorAction({ type: "selection.selectClip", clipId: sourceClip.id });
                      }
                      dispatchEditorAction({
                        type: "selection.setPlayhead",
                        timelineTime:
                          sourceClip.timelineStart +
                          (sourceTime - sourceClip.sourceStart) / sourceClip.speed,
                      });
                      if (
                        !event.currentTarget.paused &&
                        sourceTime >= sourceClip.sourceEnd - 0.05
                      ) {
                        advanceSourceClip();
                      }
                    }
                  }}
                  onEnded={() => {
                    if (!advanceSourceClip()) setIsPlaying(false);
                  }}
                />
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-5 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-12">
                <button type="button" onClick={() => seekTimeline(Math.max(0, playhead - 10))} className="min-h-10 min-w-10 text-white/80 hover:text-white" aria-label={t("editor.backTen")}><Icon name="replay_10" className="text-2xl" /></button>
                <button type="button" onClick={togglePlayback} className="min-h-10 min-w-10 text-white" aria-label={isPlaying ? t("editor.pause") : t("editor.play")}><Icon name={isPlaying ? "pause_circle" : "play_circle"} className="text-4xl" filled /></button>
                <button type="button" onClick={() => seekTimeline(Math.min(duration, playhead + 10))} className="min-h-10 min-w-10 text-white/80 hover:text-white" aria-label={t("editor.forwardTen")}><Icon name="forward_10" className="text-2xl" /></button>
              </div>
            </div>
          </div>
          {previewNotice ? <div className="px-4 py-2 text-center text-xs text-tertiary">{previewNotice}</div> : null}
        </section>

        <aside className="hidden w-72 flex-col gap-5 overflow-y-auto custom-scrollbar border-l border-outline-variant/10 bg-surface-container-high p-4 md:flex">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t("editor.inspector")}</div>
            <div className="truncate text-sm font-semibold text-on-surface">{selectedClip.label}</div>
            <div className="mt-1 text-[11px] text-on-surface-variant">{formatTime(selectedClip.timelineDuration)} · {formatTime(selectedClip.sourceEnd - selectedClip.sourceStart)} source</div>
          </div>
          <div className="space-y-3 rounded-xl bg-surface-container p-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">{t("editor.trim")}</span>
              <Tooltip content={t("editor.trimTooltip")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[10px] text-on-surface-variant">
                <span className="flex items-center gap-1">{t("editor.start")}<Tooltip content={t("editor.startTooltip")} /></span>
                <input
                  aria-label={t("editor.start")}
                  type="number"
                  min={selectedClip.sourceStart}
                  max={selectedClip.sourceEnd - 0.08}
                  step="0.01"
                  defaultValue={selectedClip.sourceStart.toFixed(2)}
                  onBlur={(event) => dispatchEditorAction({ type: "clip.trim", clipId: selectedClip.id, sourceStart: Number(event.target.value), sourceEnd: selectedClip.sourceEnd })}
                  className="w-full rounded border border-outline-variant/20 bg-surface-container-lowest px-2 py-1.5 font-mono text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                />
              </label>
              <label className="space-y-1 text-[10px] text-on-surface-variant">
                <span className="flex items-center gap-1">{t("editor.end")}<Tooltip content={t("editor.endTooltip")} /></span>
                <input
                  aria-label={t("editor.end")}
                  type="number"
                  min={selectedClip.sourceStart + 0.08}
                  step="0.01"
                  defaultValue={selectedClip.sourceEnd.toFixed(2)}
                  onBlur={(event) => dispatchEditorAction({ type: "clip.trim", clipId: selectedClip.id, sourceStart: selectedClip.sourceStart, sourceEnd: Number(event.target.value) })}
                  className="w-full rounded border border-outline-variant/20 bg-surface-container-lowest px-2 py-1.5 font-mono text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">{t("editor.speed")}<Tooltip content={t("editor.speedTooltip")} /></span>
              <div className="flex items-center overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-lowest shadow-inner shadow-black/20">
                <input
                  aria-label={t("editor.speed")}
                  type="number"
                  min="0.25"
                  max="32"
                  step="0.25"
                  value={selectedClip.speed}
                  onChange={(event) => updateSelectedSpeed(Number(event.target.value))}
                  className="h-10 w-16 appearance-none bg-transparent px-2 text-right font-mono tabular-nums text-sm font-semibold text-primary outline-none focus:bg-surface-container/80 focus:ring-2 focus:ring-inset focus:ring-primary/70 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <div className="flex h-10 flex-col border-l border-outline-variant/20">
                  <button
                    type="button"
                    aria-label={`${t("editor.speed")} +0.25`}
                    onClick={() => updateSelectedSpeed(selectedClip.speed + 0.25)}
                    disabled={selectedClip.speed >= 32}
                    className="flex h-5 w-8 items-center justify-center text-on-surface-variant transition-colors hover:bg-primary/15 hover:text-primary active:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <Icon name="keyboard_arrow_up" className="text-base" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("editor.speed")} −0.25`}
                    onClick={() => updateSelectedSpeed(selectedClip.speed - 0.25)}
                    disabled={selectedClip.speed <= 0.25}
                    className="flex h-5 w-8 items-center justify-center text-on-surface-variant transition-colors hover:bg-primary/15 hover:text-primary active:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <Icon name="keyboard_arrow_down" className="text-base" />
                  </button>
                </div>
              </div>
            </div>
            <input
              aria-label={t("editor.speed")}
              type="range"
              min="0.25"
              max="32"
              step="0.25"
              value={selectedClip.speed}
              onChange={(event) => dispatchEditorAction({ type: "clip.setSpeed", clipId: selectedClip.id, speed: Number(event.target.value) })}
              className="w-full accent-[var(--color-primary)]"
            />
            <div className="flex justify-between text-[10px] text-on-surface-variant"><span>0.25×</span><span>8×</span><span>32×</span></div>
          </div>
          <div className="space-y-3 rounded-xl bg-surface-container p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">{t("editor.silenceDetection")}</div>
            <label className="space-y-1 text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1">{t("detection.threshold")}<Tooltip content={t("detection.thresholdTooltip")} /></span>
              <input
                aria-label={t("detection.threshold")}
                type="range"
                min={-60}
                max={0}
                step={1}
                value={detectionSettings.noiseThreshold}
                onChange={(event) => updateDetectionSettings({ noiseThreshold: Number(event.target.value) })}
                className="w-full accent-[var(--color-primary)]"
              />
              <span className="font-mono text-on-surface">{detectionSettings.noiseThreshold} dB</span>
            </label>
            <label className="space-y-1 text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1">{t("detection.minDuration")}<Tooltip content={t("detection.minDurationTooltip")} /></span>
              <input
                aria-label={t("detection.minDuration")}
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={detectionSettings.minDuration}
                onChange={(event) => updateDetectionSettings({ minDuration: Number(event.target.value) })}
                className="w-full accent-[var(--color-primary)]"
              />
              <span className="font-mono text-on-surface">{detectionSettings.minDuration}s</span>
            </label>
            <Toggle
              label={t("detection.detectBreath")}
              checked={detectionSettings.detectBreath}
              onChange={(value) => updateDetectionSettings({ detectBreath: value })}
              tooltip={t("detection.detectBreathTooltip")}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-on-surface-variant">{t("detection.mode")}<Tooltip content={t("detection.modeTooltip")} /></div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateDetectionSettings({ mode: "cut" })}
                  className={`flex-1 rounded px-2 py-1 text-[10px] font-bold transition-colors ${detectionSettings.mode === "cut" ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}`}
                >
                  {t("detection.cutSilence")}
                </button>
                <button
                  type="button"
                  onClick={() => updateDetectionSettings({ mode: "speed" })}
                  className={`flex-1 rounded px-2 py-1 text-[10px] font-bold transition-colors ${detectionSettings.mode === "speed" ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}`}
                >
                  {t("detection.timeWarp")}
                </button>
              </div>
            </div>
            {detectionSettings.mode === "speed" && (
              <label className="space-y-1 text-[10px] text-on-surface-variant">
                <span className="flex items-center gap-1">{t("detection.speedMultiplier")}<Tooltip content={t("detection.speedMultiplierTooltip")} /></span>
                <input
                  aria-label={t("detection.speedMultiplier")}
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={detectionSettings.speedMultiplier}
                  onChange={(event) => updateDetectionSettings({ speedMultiplier: Number(event.target.value) })}
                  className="w-full accent-[var(--color-primary)]"
                />
                <span className="font-mono text-on-surface">{detectionSettings.speedMultiplier}x</span>
              </label>
            )}
            <Tooltip variant="wrap" delay={2000} content={t("editor.detectSilenceTooltip")}>
              <Button variant="surface" size="sm" className="w-full" onClick={() => void handleDetectSilence()} disabled={candidateBusy}>
                <Icon name={candidateBusy ? "progress_activity" : "graphic_eq"} className={`text-sm ${candidateBusy ? "animate-spin" : ""}`} />
                {candidateBusy
                  ? `${t("editor.analyzing")} ${Math.round(progress.percent)}%`
                  : t("editor.detectSilence")}
              </Button>
            </Tooltip>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
              <span className="flex items-center gap-1">{t("editor.analysisScope")}<Tooltip content={t("editor.analysisScopeTooltip")} /></span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAnalysisScopeOpen(!analysisScopeOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-[11px] text-on-surface outline-none transition-colors hover:border-primary/40 focus:ring-1 focus:ring-primary"
                >
                  {analysisScope === "clip" ? t("editor.selectedClip") : t("editor.wholeTimeline")}
                  <Icon name="expand_more" className="text-sm text-on-surface-variant" />
                </button>
                {analysisScopeOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAnalysisScopeOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-outline-variant/20 bg-surface-container-highest shadow-2xl">
                      <button
                        type="button"
                        onClick={() => { setAnalysisScope("clip"); setAnalysisScopeOpen(false); setCandidateRanges(null); }}
                        className={`flex w-full items-center px-3 py-2 text-left text-[11px] transition-colors hover:bg-primary/15 ${analysisScope === "clip" ? "text-primary font-semibold" : "text-on-surface-variant"}`}
                      >
                        {t("editor.selectedClip")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAnalysisScope("timeline"); setAnalysisScopeOpen(false); setCandidateRanges(null); }}
                        className={`flex w-full items-center px-3 py-2 text-left text-[11px] transition-colors hover:bg-primary/15 ${analysisScope === "timeline" ? "text-primary font-semibold" : "text-on-surface-variant"}`}
                      >
                        {t("editor.wholeTimeline")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            {candidateRanges ? (
              <div className="space-y-2 text-[11px] text-on-surface-variant">
                <div>{t("editor.candidateSummary", { count: candidateRanges.ranges.reduce((total, candidate) => total + candidate.segments.length, 0) })}</div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const currentRevision = useProjectStore.getState().timelineProject?.revision;
                      if (currentRevision !== candidateRanges.projectRevision) {
                        setCandidateRanges(null);
                        setPreviewNotice(t("editor.analysisStale"));
                        return;
                      }
                      dispatchEditorAction({
                        type: "analysis.acceptCandidate",
                        projectRevision: candidateRanges.projectRevision,
                        candidates: candidateRanges.ranges,
                      });
                      setCandidateRanges(null);
                    }}
                    disabled={candidateRanges.ranges.length === 0}
                  >
                    {t("editor.applyCandidate")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCandidateRanges(null)}>
                    {t("editor.discardCandidate")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-auto rounded-xl bg-surface-container p-3 text-[11px] leading-relaxed text-on-surface-variant">
            <div className="mb-1 flex items-center gap-2 text-on-surface"><Icon name="auto_awesome" className="text-sm text-secondary" />{t("editor.previewStatus")}</div>
            {t("editor.previewStatusDescription")}
          </div>
        </aside>
      </div>

      <div className="h-72 shrink-0 border-t border-outline-variant/10 bg-surface-container p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-on-surface-variant">{t("timeline.timeline")}</span>
            <span className="rounded bg-surface-container-high px-2 py-1 text-[10px] text-secondary">{t("timeline.activeClips", { count: positionedClips.length })}</span>
            <div className="flex items-center gap-1">
              <Tooltip variant="wrap" delay={2000} content={t("editor.splitTooltip")}>
                <Button variant="surface" size="sm" onClick={() => dispatchEditorAction({ type: "clip.splitAtPlayhead", clipId: selectedClip.id, timelineTime: playhead })} aria-label={t("editor.split")}><Icon name="content_cut" className="text-sm" /></Button>
              </Tooltip>
              <Tooltip variant="wrap" delay={2000} content={t("editor.duplicateTooltip")}>
                <Button variant="surface" size="sm" onClick={() => dispatchEditorAction({ type: "clip.duplicate", clipId: selectedClip.id })} aria-label={t("editor.duplicate")}><Icon name="content_copy" className="text-sm" /></Button>
              </Tooltip>
              <Tooltip variant="wrap" delay={2000} content={t("editor.moveLeftTooltip")}>
                <Button variant="ghost" size="sm" onClick={() => dispatchEditorAction({ type: "clip.move", clipId: selectedClip.id, destinationIndex: Math.max(0, positionedClips.findIndex((clip) => clip.id === selectedClip.id) - 1) })} aria-label={t("editor.moveLeft")}><Icon name="chevron_left" className="text-sm" /></Button>
              </Tooltip>
              <Tooltip variant="wrap" delay={2000} content={t("editor.moveRightTooltip")}>
                <Button variant="ghost" size="sm" onClick={() => dispatchEditorAction({ type: "clip.move", clipId: selectedClip.id, destinationIndex: positionedClips.findIndex((clip) => clip.id === selectedClip.id) + 1 })} aria-label={t("editor.moveRight")}><Icon name="chevron_right" className="text-sm" /></Button>
              </Tooltip>
              <Tooltip variant="wrap" delay={2000} content={t("editor.deleteTooltip")}>
                <Button variant="ghost" size="sm" className="text-error" onClick={() => dispatchEditorAction({ type: "clip.delete", clipId: selectedClip.id })} aria-label={t("editor.delete")}><Icon name="delete" className="text-sm" /></Button>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="min-h-10 min-w-10 rounded text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface" onClick={() => setTimelineZoom(Math.max(MIN_ZOOM, timelineZoom - 2))} aria-label={t("timeline.zoomOut")}><Icon name="zoom_out" /></button>
            <span className="w-16 text-center font-mono text-[10px] text-on-surface-variant">{timelineZoom}px/s</span>
            <button type="button" className="min-h-10 min-w-10 rounded text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface" onClick={() => setTimelineZoom(Math.min(MAX_ZOOM, timelineZoom + 2))} aria-label={t("timeline.zoomIn")}><Icon name="zoom_in" /></button>
          </div>
        </div>
        <div className="h-[calc(100%-3rem)] overflow-x-auto timeline-scrollbar rounded-xl bg-surface-container-lowest" onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left + event.currentTarget.scrollLeft;
          seekTimeline(Math.max(0, Math.min(duration, x / timelineZoom)));
        }}>
          <div className="relative h-full" style={{ width: timelineWidth }}>
            <div className="absolute inset-x-0 top-0 h-8 border-b border-outline-variant/10 text-[10px] text-on-surface-variant">
              {Array.from({ length: Math.ceil(duration / 10) + 1 }, (_, index) => index * 10).map((time) => (
                <span key={time} className="absolute top-2 -translate-x-1/2 font-mono" style={{ left: time * timelineZoom }}>{formatTime(Math.min(time, duration))}</span>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-4 top-12 rounded-lg bg-surface-container p-2">
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-on-surface-variant"><Icon name="movie" className="text-sm text-primary" />{t("editor.videoTrack")}</div>
              <div className="relative h-28">
                {positionedClips.map((clip) => (
                  <button
                    type="button"
                    key={clip.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      dispatchEditorAction({ type: "selection.selectClip", clipId: clip.id });
                      seekTimeline(clip.timelineStart);
                    }}
                    className={`absolute bottom-2 top-2 overflow-hidden rounded-lg px-2 py-2 text-left transition-colors ${selectedClipId === clip.id ? "bg-primary/40 ring-1 ring-primary" : "bg-surface-container-highest hover:bg-surface-bright"}`}
                    style={{ left: clip.timelineStart * timelineZoom, width: Math.max(clip.timelineDuration * timelineZoom - 2, 6) }}
                  >
                    <span className="block truncate text-[10px] font-semibold text-on-surface">{clip.label}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-on-surface-variant">{clip.speed}× · {formatTime(clip.timelineDuration)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary shadow-[0_0_12px_rgba(186,158,255,0.9)]" style={{ left: playhead * timelineZoom }}><div className="-ml-1.5 mt-1 h-3 w-3 rounded-full bg-primary" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
