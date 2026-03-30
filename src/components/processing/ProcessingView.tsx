import { useProjectStore } from "../../stores/projectStore";
import { Icon } from "../ui/Icon";

export function ProcessingView() {
  const { progress, filePath, detectionSettings, detectionResult } =
    useProjectStore();

  const percent = Math.round(progress.percent);
  const fileName = filePath?.split("/").pop() ?? "unknown";
  const cutsDetected = detectionResult?.segments.length ?? 0;

  // SVG circle math
  const radius = 37.5;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex-1 relative flex flex-col items-center justify-center p-8 overflow-hidden h-full">
      {/* Background waveform preview */}
      <div className="absolute inset-0 opacity-20 pointer-events-none flex flex-col justify-end pb-24 px-12">
        <div className="w-full h-48 bg-surface-container-lowest rounded-xl overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-around gap-[2px] px-4 waveform-mask">
            {Array.from({ length: 30 }).map((_, i) => {
              const isSilence = i >= 8 && i <= 14;
              const isSilence2 = i >= 20 && i <= 24;
              if (isSilence || isSilence2) {
                return i === 8 || i === 20 ? (
                  <div
                    key={i}
                    className="h-4 flex-1 mx-1 bg-error-container/40 flex items-center justify-center border-x border-error-dim/50 self-center"
                  >
                    <span className="text-[8px] uppercase font-bold tracking-tighter text-error-dim">
                      Silence Removed
                    </span>
                  </div>
                ) : null;
              }
              const height = 20 + Math.random() * 60;
              return (
                <div
                  key={i}
                  className="w-1 bg-secondary-dim rounded-full"
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
          {/* Scrubbing indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary-fixed shadow-[0_0_15px_rgba(174,141,255,0.8)] z-10"
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>

      {/* Central processing UI */}
      <div className="relative z-20 flex flex-col items-center">
        {/* Circular progress */}
        <div className="relative w-64 h-64 mb-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-surface-container-highest" />
          <svg
            className="absolute inset-0 w-full h-full -rotate-90 transform"
            viewBox="0 0 100 100"
          >
            <circle
              className="text-primary"
              cx="50"
              cy="50"
              fill="transparent"
              r={radius}
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              strokeWidth="4"
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          {/* Inner core */}
          <div className="w-48 h-48 rounded-full glass-panel flex flex-col items-center justify-center border border-outline-variant/20 shadow-2xl">
            <div className="text-6xl font-extrabold tracking-tighter text-on-surface mb-0">
              {percent}
              <span className="text-2xl text-primary">%</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Complete
            </div>
          </div>
          {/* Orbital dot */}
          <div className="absolute top-[5%] right-[22%] w-3 h-3 bg-primary-fixed rounded-full shadow-[0_0_20px_#ae8dff]" />
        </div>

        {/* Text feedback */}
        <div className="text-center space-y-3">
          <h2 className="text-2xl font-bold text-on-surface tracking-tight">
            {progress.message || "Analyzing video for silence..."}
          </h2>
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-full border border-outline-variant/10">
              <Icon name="timer" className="text-sm text-primary" />
              <span className="text-xs font-medium text-on-surface-variant">
                Stage:{" "}
                <span className="text-on-surface">{progress.stage}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-full border border-outline-variant/10">
              <Icon name="cut" className="text-sm text-secondary" />
              <span className="text-xs font-medium text-on-surface-variant">
                Cuts detected:{" "}
                <span className="text-on-surface">{cutsDetected}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Linear progress */}
        <div className="w-80 mt-12 bg-surface-container-high h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary shimmer rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Metadata cards */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 w-full max-w-4xl px-8">
        <div className="flex-1 glass-panel p-4 rounded-xl border border-outline-variant/10">
          <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
            Source File
          </div>
          <div className="text-sm font-medium truncate">{fileName}</div>
        </div>
        <div className="flex-none w-48 glass-panel p-4 rounded-xl border border-outline-variant/10">
          <div className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-1">
            Decibel Floor
          </div>
          <div className="text-sm font-medium">
            {detectionSettings.noiseThreshold}dB Sensitivity
          </div>
        </div>
        <div className="flex-none w-48 glass-panel p-4 rounded-xl border border-outline-variant/10">
          <div className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-1">
            {detectionSettings.mode === "speed"
              ? "Speed Multiplier"
              : "Min Duration"}
          </div>
          <div className="text-sm font-medium">
            {detectionSettings.mode === "speed"
              ? `${detectionSettings.speedMultiplier}x Skip Speed`
              : `${detectionSettings.minDuration}s`}
          </div>
        </div>
      </div>
    </div>
  );
}
