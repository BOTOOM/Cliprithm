import { useRef, useState } from "react";
import type { SemanticRange, TimelineProject } from "../../types";
import { MIN_CLIP_DURATION } from "../../lib/editor/timeline";
import { formatTime } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../ui/Icon";

interface SemanticRangeTrackProps {
  project: TimelineProject;
  duration: number;
  timelineZoom: number;
  timelineWidth: number;
  selectedRangeId: string | null;
  toolActive: boolean;
  onSelect: (rangeId: string) => void;
  onOpen: (rangeId: string) => void;
  onCreate: (start: number, end: number) => void;
  onResize: (rangeId: string, start: number, end: number) => void;
  onToggleTool: () => void;
}

type Interaction =
  | { mode: "create"; start: number; current: number }
  | { mode: "resize"; rangeId: string; edge: "start" | "end"; start: number; end: number }
  | null;

function clampTime(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, time));
}

function rangeTimeFromEvent(
  event: React.PointerEvent<HTMLElement>,
  element: HTMLElement,
  timelineZoom: number,
  duration: number,
): number {
  const rect = element.getBoundingClientRect();
  return clampTime((event.clientX - rect.left - 96) / timelineZoom, duration);
}

function blockBounds(range: SemanticRange, interaction: Interaction): { start: number; end: number } | null {
  if (interaction?.mode === "resize" && interaction.rangeId === range.id) {
    return { start: interaction.start, end: interaction.end };
  }
  if (range.timelineStart === null || range.timelineEnd === null) return null;
  return { start: range.timelineStart, end: range.timelineEnd };
}

export function SemanticRangeTrack({
  project,
  duration,
  timelineZoom,
  timelineWidth,
  selectedRangeId,
  toolActive,
  onSelect,
  onOpen,
  onCreate,
  onResize,
  onToggleTool,
}: SemanticRangeTrackProps) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const placedRanges = project.semanticRanges.filter(
    (range) => range.timelineStart !== null && range.timelineEnd !== null,
  );
  const unplacedCount = project.semanticRanges.length - placedRanges.length;
  const draftBounds = interaction?.mode === "create"
    ? {
        start: Math.min(interaction.start, interaction.current),
        end: Math.max(interaction.start, interaction.current),
      }
    : null;

  const finishInteraction = () => {
    if (!interaction) return;
    if (interaction.mode === "create") {
      const start = Math.min(interaction.start, interaction.current);
      const end = Math.max(interaction.start, interaction.current);
      if (end - start >= MIN_CLIP_DURATION) onCreate(start, end);
    } else if (interaction.start !== interaction.end) {
      onResize(interaction.rangeId, interaction.start, interaction.end);
    }
    setInteraction(null);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction || !trackRef.current) return;
    const time = rangeTimeFromEvent(event, trackRef.current, timelineZoom, duration);
    if (interaction.mode === "create") {
      setInteraction({ ...interaction, current: time });
      return;
    }
    const range = project.semanticRanges.find((candidate) => candidate.id === interaction.rangeId);
    if (!range || range.timelineStart === null || range.timelineEnd === null) return;
    if (interaction.edge === "start") {
      setInteraction({
        ...interaction,
        start: Math.min(time, interaction.end - MIN_CLIP_DURATION),
      });
    } else {
      setInteraction({
        ...interaction,
        end: Math.max(time, interaction.start + MIN_CLIP_DURATION),
      });
    }
  };

  return (
    <div className="flex min-h-16 items-stretch border-b border-outline-variant/10 bg-surface-container">
      <div className="flex w-24 shrink-0 flex-col justify-center gap-1 border-r border-outline-variant/10 px-2">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          <Icon name="bookmark" className="text-sm text-secondary" />
          <span>{t("editor.semanticRanges")}</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-on-surface-variant/70">
          <span>{placedRanges.length}</span>
          {unplacedCount > 0 ? (
            <button
              type="button"
              className="truncate text-left underline decoration-dotted underline-offset-2 hover:text-on-surface"
              onClick={() => {
                const firstUnplaced = project.semanticRanges.find((range) => range.timelineStart === null);
                if (firstUnplaced) onOpen(firstUnplaced.id);
              }}
            >
              · {t("editor.unplacedRanges", { count: unplacedCount })}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleTool}
          aria-pressed={toolActive}
          className={`mt-1 inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 text-[9px] font-semibold transition-colors ${toolActive ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"}`}
        >
          <Icon name={toolActive ? "close" : "add"} className="text-xs" />
          {toolActive ? t("editor.cancelRangeTool") : t("editor.addSemanticRange")}
        </button>
      </div>
      <div
        ref={trackRef}
        className={`relative min-h-16 flex-1 select-none ${toolActive ? "cursor-crosshair" : ""}`}
        style={{ width: timelineWidth + 96 }}
        onPointerDown={(event) => {
          if (!toolActive || event.target !== event.currentTarget || !trackRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          trackRef.current.setPointerCapture(event.pointerId);
          const time = rangeTimeFromEvent(event, trackRef.current, timelineZoom, duration);
          setInteraction({ mode: "create", start: time, current: time });
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          if (interaction) event.stopPropagation();
          if (trackRef.current?.hasPointerCapture(event.pointerId)) trackRef.current.releasePointerCapture(event.pointerId);
          finishInteraction();
        }}
        onPointerCancel={() => setInteraction(null)}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-secondary/20" />
        {placedRanges.map((range) => {
          const bounds = blockBounds(range, interaction);
          if (!bounds) return null;
          const selected = selectedRangeId === range.id;
          return (
            <div
              key={range.id}
              role="group"
              tabIndex={-1}
              aria-label={`${range.title}, ${formatTime(bounds.start)}–${formatTime(bounds.end)}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(range.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onOpen(range.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(range.id);
                if (event.key === " ") {
                  event.preventDefault();
                  onSelect(range.id);
                }
              }}
              className={`absolute bottom-2 top-2 overflow-visible rounded-md border px-2 py-1.5 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-secondary ${selected ? "border-secondary bg-secondary/35 text-on-surface ring-1 ring-secondary/70" : "border-secondary/35 bg-secondary/20 text-on-surface hover:bg-secondary/30"}`}
              style={{ left: bounds.start * timelineZoom, width: Math.max((bounds.end - bounds.start) * timelineZoom, 12) }}
            >
              {selected ? (
                <button
                  type="button"
                  role="slider"
                  tabIndex={0}
                  aria-label={t("editor.resizeSemanticRangeStart")}
                  aria-valuemin={0}
                  aria-valuemax={bounds.end - MIN_CLIP_DURATION}
                  aria-valuenow={bounds.start}
                  className="absolute -left-2 top-0 z-10 h-full w-4 cursor-ew-resize rounded-l-md bg-secondary/80 opacity-90"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    onSelect(range.id);
                    trackRef.current?.setPointerCapture(event.pointerId);
                    setInteraction({ mode: "resize", rangeId: range.id, edge: "start", start: bounds.start, end: bounds.end });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    event.stopPropagation();
                    const step = event.shiftKey ? 1 : 0.1;
                    const nextStart = Math.max(0, Math.min(bounds.end - MIN_CLIP_DURATION, bounds.start + (event.key === "ArrowRight" ? step : -step)));
                    onResize(range.id, nextStart, bounds.end);
                  }}
                />
              ) : null}
              <span className="block truncate text-[10px] font-semibold">{range.title}</span>
              <span className="block truncate font-mono text-[9px] text-on-surface-variant">
                {formatTime(bounds.start)}–{formatTime(bounds.end)}
              </span>
              {selected ? (
                <button
                  type="button"
                  role="slider"
                  tabIndex={0}
                  aria-label={t("editor.resizeSemanticRangeEnd")}
                  aria-valuemin={bounds.start + MIN_CLIP_DURATION}
                  aria-valuemax={duration}
                  aria-valuenow={bounds.end}
                  className="absolute -right-2 top-0 z-10 h-full w-4 cursor-ew-resize rounded-r-md bg-secondary/80 opacity-90"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    onSelect(range.id);
                    trackRef.current?.setPointerCapture(event.pointerId);
                    setInteraction({ mode: "resize", rangeId: range.id, edge: "end", start: bounds.start, end: bounds.end });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    event.stopPropagation();
                    const step = event.shiftKey ? 1 : 0.1;
                    const nextEnd = Math.max(bounds.start + MIN_CLIP_DURATION, bounds.end + (event.key === "ArrowRight" ? step : -step));
                    onResize(range.id, bounds.start, nextEnd);
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {draftBounds ? (
          <div
            className="pointer-events-none absolute bottom-2 top-2 rounded-md border border-dashed border-secondary bg-secondary/25 px-2 py-1.5"
            style={{ left: draftBounds.start * timelineZoom, width: Math.max((draftBounds.end - draftBounds.start) * timelineZoom, 2) }}
          >
            <span className="text-[9px] font-semibold text-on-surface">{t("editor.newSemanticRange")}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
