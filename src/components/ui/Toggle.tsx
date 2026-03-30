interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-on-surface">{label}</span>
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
