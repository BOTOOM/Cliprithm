import { Tooltip } from "./Tooltip";

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
}

export function Toggle({ label, checked, onChange, tooltip }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-on-surface">{label}</span>
        {tooltip ? <Tooltip content={tooltip} /> : null}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full relative p-0.5 transition-colors ${
          checked ? "bg-secondary-container" : "bg-surface-container-highest"
        }`}
      >
        <div
          className={`w-3 h-3 rounded-full transition-all ${
            checked
              ? "bg-secondary-fixed ml-auto"
              : "bg-outline ml-0"
          }`}
        />
      </button>
    </div>
  );
}
