import type { ClipSegment, SilenceSegment } from "../types";

const MIN_SEGMENT_DURATION = 0.08;

function toClipSegment(start: number, end: number, index: number): ClipSegment {
  return {
    id: `clip-${index}-${start.toFixed(3)}-${end.toFixed(3)}`,
    label: `Clip ${String(index + 1).padStart(2, "0")}`,
    start,
    end,
    duration: Math.max(0, end - start),
  };
}

function normalizeClips(clips: Array<Pick<ClipSegment, "start" | "end">>): ClipSegment[] {
  return clips
    .filter((clip) => clip.end - clip.start >= MIN_SEGMENT_DURATION)
    .sort((a, b) => a.start - b.start)
    .map((clip, index) => toClipSegment(clip.start, clip.end, index));
}

export function buildClipSegmentsFromSilence(
  silenceSegments: SilenceSegment[],
  totalDuration: number
): ClipSegment[] {
  const clips: Array<Pick<ClipSegment, "start" | "end">> = [];
  let current = 0;

  for (const segment of [...silenceSegments].sort((a, b) => a.start - b.start)) {
    if (segment.start > current) {
      clips.push({ start: current, end: segment.start });
    }
    current = Math.max(current, segment.end);
  }

  if (current < totalDuration) {
    clips.push({ start: current, end: totalDuration });
  }

  if (clips.length === 0 && totalDuration > 0) {
    clips.push({ start: 0, end: totalDuration });
  }

  return normalizeClips(clips);
}

export function buildSilenceSegmentsFromClips(
  clips: ClipSegment[],
  totalDuration: number
): SilenceSegment[] {
  if (totalDuration <= 0) return [];

  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const silence: SilenceSegment[] = [];
  let current = 0;

  for (const clip of sorted) {
    if (clip.start > current) {
      silence.push({
        start: current,
        end: clip.start,
        duration: clip.start - current,
      });
    }
    current = Math.max(current, clip.end);
  }

  if (current < totalDuration) {
    silence.push({
      start: current,
      end: totalDuration,
      duration: totalDuration - current,
    });
  }

  return silence.filter((segment) => segment.duration >= MIN_SEGMENT_DURATION);
}

export function removeClipById(clips: ClipSegment[], clipId: string): ClipSegment[] {
  return normalizeClips(clips.filter((clip) => clip.id !== clipId));
}

export function splitClipByTime(
  clips: ClipSegment[],
  clipId: string,
  time: number
): ClipSegment[] {
  const next: Array<Pick<ClipSegment, "start" | "end">> = [];

  for (const clip of clips) {
    if (clip.id !== clipId) {
      next.push({ start: clip.start, end: clip.end });
      continue;
    }

    if (
      time <= clip.start + MIN_SEGMENT_DURATION ||
      time >= clip.end - MIN_SEGMENT_DURATION
    ) {
      next.push({ start: clip.start, end: clip.end });
      continue;
    }

    next.push({ start: clip.start, end: time });
    next.push({ start: time, end: clip.end });
  }

  return normalizeClips(next);
}

export function getTotalClipDuration(clips: ClipSegment[]): number {
  return clips.reduce((acc, clip) => acc + clip.duration, 0);
}

export function sourceToEditedTime(sourceTime: number, clips: ClipSegment[]): number {
  if (clips.length === 0) return sourceTime;

  let editedCursor = 0;
  for (const clip of clips) {
    if (sourceTime < clip.start) {
      return editedCursor;
    }
    if (sourceTime <= clip.end) {
      return editedCursor + (sourceTime - clip.start);
    }
    editedCursor += clip.duration;
  }

  return editedCursor;
}

export function editedToSourceTime(editedTime: number, clips: ClipSegment[]): number {
  if (clips.length === 0) return editedTime;

  let editedCursor = 0;
  for (const clip of clips) {
    const nextCursor = editedCursor + clip.duration;
    if (editedTime <= nextCursor) {
      return clip.start + Math.max(0, editedTime - editedCursor);
    }
    editedCursor = nextCursor;
  }

  const lastClip = clips[clips.length - 1];
  return lastClip?.end ?? 0;
}

export function findClipAtSourceTime(
  sourceTime: number,
  clips: ClipSegment[]
): ClipSegment | null {
  return (
    clips.find((clip) => sourceTime >= clip.start && sourceTime <= clip.end) ?? null
  );
}
