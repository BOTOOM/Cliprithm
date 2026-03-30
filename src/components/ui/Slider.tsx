interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  displayValue: string;
  onChange: (value: number) => void;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  label,
  displayValue,
  onChange,
}: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold text-on-surface-variant">
          {label}
        </label>
        <span className="text-xs font-mono text-primary">{displayValue}</span>
      </div>
      <div className="relative h-1 w-full">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
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
    </div>
  );
}
