import { useMemo, useRef, useState } from "react";
import type { SilenceSegment } from "../../types";
import { formatTime } from "../../lib/utils";

interface DetectionTimelineProps {
  duration: number;
  currentTime: number;
  segments: SilenceSegment[];
  onSeek: (time: number) => void;
}

function buildWaveHeights(count: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const v1 = Math.abs(Math.sin(index * 0.42));
    const v2 = Math.abs(Math.cos(index * 0.17));
    return 18 + (v1 * 0.6 + v2 * 0.4) * 62;
  });
}

export function DetectionTimeline({
  duration,
  currentTime,
  segments,
  onSeek,
}: DetectionTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const safeDuration = Math.max(duration, 0.01);
  const markerStep = duration > 180 ? 30 : duration > 90 ? 15 : 10;
  const markerCount = Math.max(1, Math.ceil(duration / markerStep));
  const markers = Array.from({ length: markerCount + 1 }, (_, index) => {
    const time = Math.min(duration, index * markerStep);
    return { time, left: `${(time / safeDuration) * 100}%` };
  });

  const heights = useMemo(() => buildWaveHeights(72), []);

  const scrubTo = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="h-[280px] bg-surface-container border-t border-outline-variant/10 flex flex-col p-4 gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">
          Timeline
        </span>
        <div className="flex items-center gap-2 px-2 py-1 bg-surface-container-high rounded border border-outline-variant/10">
          <span className="w-2 h-2 bg-secondary rounded-full" />
          <span className="text-[10px] font-medium text-secondary">
            Audio active
          </span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-surface-container-high rounded border border-outline-variant/10">
          <span className="w-2 h-2 bg-error-dim rounded-full" />
          <span className="text-[10px] font-medium text-error-dim">
            Silence ({segments.length})
          </span>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative flex-1 rounded-xl bg-[#090909] border border-outline-variant/10 overflow-hidden select-none"
        onMouseDown={(event) => {
          setIsScrubbing(true);
          scrubTo(event.clientX);
        }}
        onMouseMove={(event) => {
          if (isScrubbing) scrubTo(event.clientX);
        }}
        onMouseUp={() => setIsScrubbing(false)}
        onMouseLeave={() => setIsScrubbing(false)}
      >
        <div className="absolute inset-x-0 top-0 h-10 border-b border-outline-variant/10 bg-surface/70">
          {markers.map((marker) => (
            <div
              key={marker.time}
              className="absolute top-0 bottom-0"
              style={{ left: marker.left }}
            >
              <div className="w-px h-full bg-outline-variant/15" />
              <span className="absolute top-2 left-2 text-[10px] font-mono text-on-surface-variant whitespace-nowrap">
                {formatTime(marker.time)}
              </span>
            </div>
          ))}
        </div>

        <div className="absolute inset-x-0 top-10 bottom-0">
          {segments.map((segment, index) => (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              className="absolute top-1/2 h-1 -translate-y-1/2 bg-error-dim/40 border-y border-error-dim/30"
              style={{
                left: `${(segment.start / safeDuration) * 100}%`,
                width: `${(segment.duration / safeDuration) * 100}%`,
              }}
            />
          ))}

          <div className="absolute inset-0 flex items-center justify-between gap-1 px-4">
            {heights.map((height, index) => {
              const time = ((index + 0.5) / heights.length) * duration;
              const isSilence = segments.some(
                (segment) => time >= segment.start && time <= segment.end
              );
              return (
                <div
                  key={index}
                  className={`w-full rounded-full ${
                    isSilence ? "bg-error-dim/35" : "bg-secondary"
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
        </div>

        <div
          className="absolute top-0 bottom-0 w-px bg-primary shadow-[0_0_12px_rgba(186,158,255,0.9)] z-20 pointer-events-none"
          style={{ left: `${(currentTime / safeDuration) * 100}%` }}
        >
          <div className="w-3 h-3 bg-primary rounded-full -translate-x-1/2 mt-2" />
        </div>
      </div>
    </div>
  );
}
