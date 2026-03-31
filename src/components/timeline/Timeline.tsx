import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipSegment } from "../../types";
import { useI18n } from "../../lib/i18n";
import { formatTime } from "../../lib/utils";
import { Icon } from "../ui/Icon";

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: ClipSegment[];
  selectedClipId: string | null;
  removedSegmentsCount: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string) => void;
}

interface PositionedClip extends ClipSegment {
  editedStart: number;
  editedEnd: number;
}

const MIN_ZOOM = 4;
const MAX_ZOOM = 40;

function getMarkerStep(duration: number, zoom: number): number {
  const options = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  return options.find((step) => step * zoom >= 96) ?? Math.max(60, duration / 10);
}

export function Timeline({
  duration,
  currentTime,
  clips,
  selectedClipId,
  removedSegmentsCount,
  zoom,
  onZoomChange,
  onSeek,
  onSelectClip,
}: TimelineProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const positionedClips = useMemo<PositionedClip[]>(() => {
    let cursor = 0;
    return clips.map((clip) => {
      const next = {
        ...clip,
        editedStart: cursor,
        editedEnd: cursor + clip.duration,
      };
      cursor += clip.duration;
      return next;
    });
  }, [clips]);

  const safeDuration = Math.max(duration, 0.01);
  const timelineWidth = Math.max(duration * zoom, 900);
  const playheadLeft = (currentTime / safeDuration) * timelineWidth;
  const markerStep = getMarkerStep(duration, zoom);
  const markerCount = Math.max(1, Math.ceil(duration / markerStep));
  const markers = Array.from({ length: markerCount + 1 }, (_, index) => {
    const time = Math.min(duration, index * markerStep);
    return { time, left: (time / safeDuration) * timelineWidth };
  });

  const scrubToClientX = (clientX: number) => {
    if (!trackRef.current || !scrollRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left + scrollRef.current.scrollLeft;
    const nextTime = Math.max(0, Math.min(duration, (x / timelineWidth) * duration));
    onSeek(nextTime);
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMove = (event: MouseEvent) => scrubToClientX(event.clientX);
    const handleUp = () => setIsScrubbing(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [duration, isScrubbing, timelineWidth]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (isScrubbing) return;

    const targetLeft = playheadLeft - container.clientWidth / 2;
    const maxScroll = Math.max(0, timelineWidth - container.clientWidth);
    const nextScroll = Math.max(0, Math.min(maxScroll, targetLeft));
    container.scrollTo({ left: nextScroll, behavior: "smooth" });
  }, [isScrubbing, playheadLeft, timelineWidth]);

  return (
    <div className="h-[300px] min-w-0 bg-surface-container border-t border-outline-variant/10 flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">
            {t("timeline.timeline")}
          </span>
          <div className="flex items-center gap-2 px-2 py-1 bg-surface-container-high rounded border border-outline-variant/10">
            <span className="w-2 h-2 bg-secondary rounded-full" />
            <span className="text-[10px] font-medium text-secondary">
              {t("timeline.activeClips", { count: clips.length })}
            </span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 bg-surface-container-high rounded border border-outline-variant/10">
            <span className="w-2 h-2 bg-error-dim rounded-full" />
            <span className="text-[10px] font-medium text-error-dim">
              {t("timeline.silencesRemoved", { count: removedSegmentsCount })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-on-surface-variant">
          <button
            className="p-2 rounded-md hover:bg-surface-container-highest hover:text-white transition-colors"
            onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - 2))}
            aria-label="Zoom out timeline"
          >
            <Icon name="zoom_out" className="text-lg" />
          </button>
          <span className="text-[10px] uppercase tracking-widest w-12 text-center">
            {zoom}px/s
          </span>
          <button
            className="p-2 rounded-md hover:bg-surface-container-highest hover:text-white transition-colors"
            onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + 2))}
            aria-label="Zoom in timeline"
          >
            <Icon name="zoom_in" className="text-lg" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden custom-scrollbar rounded-xl bg-surface-container-lowest border border-outline-variant/10"
        onWheel={(event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          event.preventDefault();
          const nextZoom = event.deltaY > 0 ? zoom - 2 : zoom + 2;
          onZoomChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
        }}
      >
        <div
          ref={trackRef}
          style={{ width: `${timelineWidth}px` }}
          className="relative h-full select-none"
          onMouseDown={(event) => {
            setIsScrubbing(true);
            scrubToClientX(event.clientX);
          }}
        >
          <div className="absolute inset-x-0 top-0 h-10 border-b border-outline-variant/10 bg-surface/80">
            {markers.map((marker) => (
              <div
                key={marker.time}
                className="absolute top-0 bottom-0"
                style={{ left: `${marker.left}px` }}
              >
                <div className="w-px h-full bg-outline-variant/20" />
                <span className="absolute top-2 left-2 text-[10px] font-mono text-on-surface-variant whitespace-nowrap">
                  {formatTime(marker.time)}
                </span>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 top-12 bottom-6 rounded-lg bg-[#111111] border border-outline-variant/10 overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] opacity-30" />

            {positionedClips.map((clip) => {
              const left = (clip.editedStart / safeDuration) * timelineWidth;
              const width = Math.max((clip.duration / safeDuration) * timelineWidth, 32);
              const selected = selectedClipId === clip.id;

              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectClip(clip.id);
                    onSeek(clip.editedStart);
                  }}
                  className={`absolute top-5 bottom-5 rounded-xl border text-left overflow-hidden transition-all ${
                    selected
                      ? "bg-primary/35 border-primary shadow-[0_0_0_1px_rgba(186,158,255,0.5)]"
                      : "bg-surface-container-high border-outline-variant/20 hover:border-primary/40 hover:bg-surface-container-highest"
                  }`}
                  style={{ left: `${left}px`, width: `${width}px` }}
                >
                  <div className="absolute inset-0 opacity-50 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_0%,transparent_12%,rgba(255,255,255,0.06)_24%,transparent_36%)] bg-[length:44px_100%]" />
                  <div className="relative h-full p-3 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/90 font-bold truncate">
                        {clip.label}
                      </p>
                      <p className="text-[10px] text-white/60 truncate">
                        {formatTime(clip.start)} → {formatTime(clip.end)}
                      </p>
                    </div>
                    <div className="text-[10px] font-mono text-white/75">
                      {formatTime(clip.duration)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="absolute top-0 bottom-0 w-px bg-primary shadow-[0_0_12px_rgba(186,158,255,0.9)] z-20 pointer-events-none"
            style={{ left: `${playheadLeft}px` }}
          >
            <div className="w-3 h-3 bg-primary rounded-full -translate-x-1/2 mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
