import { useState, useRef, useEffect, useCallback } from "react";

// 0.5→2.0 step 0.1, then 2.0→4.0 step 0.5
const SPEED_STOPS = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8,
  1.9, 2.0, 2.5, 3.0, 3.5, 4.0,
];

function nearestStopIndex(value: number): number {
  let best = 0;
  let bestDiff = Math.abs(SPEED_STOPS[0] - value);
  for (let i = 1; i < SPEED_STOPS.length; i++) {
    const diff = Math.abs(SPEED_STOPS[i] - value);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return best;
}

function clampSpeed(v: number): number {
  return Math.max(0.5, Math.min(4.0, Math.round(v * 10) / 10));
}

interface SpeedControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function SpeedControl({ value, onChange }: SpeedControlProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const stopIndex = nearestStopIndex(value);
  const percent = (stopIndex / (SPEED_STOPS.length - 1)) * 100;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = Number(e.target.value);
      onChange(SPEED_STOPS[idx]);
    },
    [onChange]
  );

  const startEditing = useCallback(() => {
    setInputText(String(value));
    setIsEditing(true);
  }, [value]);

  const commitInput = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(inputText);
    if (!isNaN(parsed)) {
      onChange(clampSpeed(parsed));
    }
  }, [inputText, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commitInput();
      if (e.key === "Escape") setIsEditing(false);
    },
    [commitInput]
  );

  // Only allow digits, dot, and at most one decimal place
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (/^\d*\.?\d{0,1}$/.test(raw) || raw === "") {
        setInputText(raw);
      }
    },
    []
  );

  return (
    <div className="space-y-2">
      {/* Value display / manual input */}
      <div className="flex items-center justify-end">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={inputText}
              onChange={handleInputChange}
              onBlur={commitInput}
              onKeyDown={handleKeyDown}
              className="w-12 text-xs font-mono text-center bg-surface-container border border-outline-variant rounded px-1 py-0.5 text-on-surface focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-on-surface-variant">×</span>
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="text-xs font-mono text-primary hover:text-primary-dim transition-colors cursor-text px-1 py-0.5 rounded hover:bg-surface-container"
            title="Click to type a custom speed"
          >
            {value}×
          </button>
        )}
      </div>

      {/* Slider */}
      <div className="relative h-1 w-full">
        <input
          type="range"
          min={0}
          max={SPEED_STOPS.length - 1}
          step={1}
          value={stopIndex}
          onChange={handleSlider}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="absolute inset-0 bg-surface-container-highest rounded-full" />
        <div
          className="absolute top-0 left-0 h-full bg-primary-fixed rounded-full shadow-[0_0_8px_rgba(174,141,255,0.3)]"
          style={{ width: `${percent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary border-2 border-on-primary rounded-full pointer-events-none"
          style={{ left: `calc(${percent}% - 8px)` }}
        />
      </div>

      {/* Tick marks for key speeds */}
      <div className="flex justify-between px-0.5">
        {[0.5, 1, 2, 4].map((s) => (
          <span
            key={s}
            className={`text-[9px] cursor-pointer transition-colors ${
              Math.abs(value - s) < 0.05
                ? "text-primary font-bold"
                : "text-on-surface-variant/50 hover:text-on-surface-variant"
            }`}
            onClick={() => onChange(s)}
          >
            {s}×
          </span>
        ))}
      </div>
    </div>
  );
}
