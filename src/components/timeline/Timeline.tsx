import { useMemo } from "react";
import type { SilenceSegment } from "../../types";
import { Icon } from "../ui/Icon";

interface TimelineProps {
  duration: number;
  currentTime: number;
  silenceSegments: SilenceSegment[];
  removedSegments: SilenceSegment[];
  onSeek: (time: number) => void;
}

export function Timeline({
  duration,
  currentTime,
  silenceSegments,
  removedSegments,
  onSeek,
}: TimelineProps) {
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const timeMarkers = useMemo(() => {
    if (duration <= 0) return [];
    const count = Math.min(10, Math.ceil(duration / 5));
    const step = duration / count;
    return Array.from({ length: count + 1 }, (_, i) => {
      const time = i * step;
      return `${Math.floor(time)}s`;
    });
  }, [duration]);

  // Generate waveform bars
  const bars = useMemo(() => {
    const barCount = 100;
    return Array.from({ length: barCount }, (_, i) => {
      const time = (i / barCount) * duration;
      const isSilence = removedSegments.some(
        (seg) => time >= seg.start && time <= seg.end
      );
      const height = isSilence ? 4 : 20 + Math.sin(i * 0.7) * 30 + Math.random() * 20;
      return { height, isSilence, time };
    });
  }, [duration, removedSegments]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  return (
    <div className="h-64 bg-surface-container border-t border-outline-variant/10 flex flex-col p-4">
      {/* Timeline header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">
            Timeline
          </span>
          <div className="flex items-center gap-2 px-2 py-0.5 bg-surface-container-high rounded border border-outline-variant/10">
            <span className="w-2 h-2 bg-secondary rounded-full" />
            <span className="text-[10px] font-medium text-secondary">
              Audio Active
            </span>
          </div>
          <div className="flex items-center gap-2 px-2 py-0.5 bg-surface-container-high rounded border border-outline-variant/10">
            <span className="w-2 h-2 bg-error-dim rounded-full" />
            <span className="text-[10px] font-medium text-error-dim">
              Silence ({removedSegments.length})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-on-surface-variant">
          <Icon
            name="zoom_in"
            className="text-lg cursor-pointer hover:text-white"
          />
          <Icon
            name="zoom_out"
            className="text-lg cursor-pointer hover:text-white"
          />
        </div>
      </div>

      {/* Waveform */}
      <div
        className="flex-1 relative bg-surface-container-lowest rounded overflow-hidden flex items-center cursor-pointer group"
        onClick={handleClick}
      >
        {/* Time markers */}
        <div className="absolute top-0 left-0 w-full h-4 border-b border-outline-variant/5 flex justify-between px-2 text-[9px] text-on-surface-variant/40 font-mono">
          {timeMarkers.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>

        {/* Waveform bars */}
        <div className="w-full h-24 flex items-center gap-[1px] px-2 opacity-80 mt-2">
          {bars.map((bar, i) =>
            bar.isSilence ? (
              <div
                key={i}
                className="flex-1 h-1 bg-error-dim/30 rounded"
              />
            ) : (
              <div
                key={i}
                className="flex-1 bg-secondary rounded-full"
                style={{ height: `${bar.height}%` }}
              />
            )
          )}
        </div>

        {/* Playhead */}
        <div
          className="absolute inset-y-0 w-px bg-primary shadow-[0_0_10px_rgba(186,158,255,0.8)] z-10 flex flex-col items-center pointer-events-none transition-all duration-100"
          style={{ left: `${playheadPercent}%` }}
        >
          <div className="w-3 h-3 bg-primary rotate-45 -mt-1.5" />
        </div>
      </div>
    </div>
  );
}
