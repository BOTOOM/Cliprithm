import { useCallback, useRef, useState } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { detectSilence, cutSilence } from "../../services/tauriCommands";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";
import { formatTime } from "../../lib/utils";
import { Timeline } from "../timeline/Timeline";

export function EditorView() {
  const {
    filePath,
    videoMetadata,
    detectionResult,
    detectionSettings,
    updateDetectionSettings,
    setDetectionResult,
    removedSegments,
    setProgress,
    processedFilePath,
    setProcessedFilePath,
    setView,
  } = useProjectStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isRedetecting, setIsRedetecting] = useState(false);
  const [isCutting, setIsCutting] = useState(false);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleRedetect = useCallback(async () => {
    if (!filePath) return;
    setIsRedetecting(true);
    try {
      const result = await detectSilence(
        filePath,
        detectionSettings.noiseThreshold,
        detectionSettings.minDuration
      );
      setDetectionResult(result);
    } catch (err) {
      console.error("Re-detection failed:", err);
    } finally {
      setIsRedetecting(false);
    }
  }, [filePath, detectionSettings, setDetectionResult]);

  const handleAutoCut = useCallback(async () => {
    if (!filePath || removedSegments.length === 0) return;
    setIsCutting(true);
    try {
      const outputPath = filePath.replace(/(\.\w+)$/, "_processed$1");
      setProgress({
        percent: 10,
        stage: "cutting",
        message: "Processing video...",
      });
      setView("processing");

      const result = await cutSilence(
        filePath,
        removedSegments,
        outputPath,
        detectionSettings.mode,
        detectionSettings.mode === "speed"
          ? detectionSettings.speedMultiplier
          : undefined
      );
      setProcessedFilePath(result);
      setProgress({
        percent: 100,
        stage: "complete",
        message: "Video processed successfully!",
      });
      setTimeout(() => setView("editor"), 1500);
    } catch (err) {
      console.error("Cut failed:", err);
      setView("editor");
    } finally {
      setIsCutting(false);
    }
  }, [
    filePath,
    removedSegments,
    detectionSettings,
    setProgress,
    setView,
    setProcessedFilePath,
  ]);

  const videoSrc = processedFilePath || filePath;
  const duration = videoMetadata?.duration ?? 0;
  const gapCount = detectionResult?.segments.length ?? 0;
  const originalDuration = detectionResult?.original_duration ?? duration;
  const estimatedDuration = detectionResult?.estimated_output_duration ?? duration;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        {/* Center: Video + Timeline */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Video Preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-surface-container-low relative">
            {/* Floating action bar */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-surface-container-highest/70 backdrop-blur-xl px-4 py-2 rounded-full border border-outline-variant/10 shadow-2xl z-10">
              <button className="p-2 hover:bg-surface-bright rounded-full text-on-surface-variant hover:text-white transition-colors">
                <Icon name="undo" className="text-xl" />
              </button>
              <button className="p-2 hover:bg-surface-bright rounded-full text-on-surface-variant hover:text-white transition-colors">
                <Icon name="redo" className="text-xl" />
              </button>
              <div className="w-px h-4 bg-outline-variant/30 mx-1" />
              <button className="flex items-center gap-2 px-3 py-1 hover:bg-surface-bright rounded-full text-sm font-medium text-on-surface-variant hover:text-white transition-colors">
                <Icon name="history" className="text-lg" />
                Restore Segment
              </button>
            </div>

            {/* Video player */}
            <div className="h-full aspect-[9/16] bg-surface-container-lowest rounded-xl shadow-[0_0_100px_rgba(186,158,255,0.05)] overflow-hidden relative group border border-outline-variant/10">
              {videoSrc && (
                <video
                  ref={videoRef}
                  src={`asset://localhost/${videoSrc}`}
                  className="w-full h-full object-cover"
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                />
              )}
              {/* Player overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center justify-center gap-8 mb-6">
                  <button onClick={() => videoRef.current && (videoRef.current.currentTime -= 10)}>
                    <Icon name="replay_10" className="text-white text-3xl" />
                  </button>
                  <button onClick={handlePlayPause}>
                    <Icon
                      name={isPlaying ? "pause_circle" : "play_circle"}
                      className="text-white text-5xl"
                      filled
                    />
                  </button>
                  <button onClick={() => videoRef.current && (videoRef.current.currentTime += 10)}>
                    <Icon name="forward_10" className="text-white text-3xl" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs font-mono text-white/80">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="w-full h-1 bg-surface-container-highest rounded-full mt-2 relative">
                  <div
                    className="absolute top-0 left-0 h-full bg-primary rounded-full"
                    style={{
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <Timeline
            duration={duration}
            currentTime={currentTime}
            silenceSegments={detectionResult?.segments ?? []}
            removedSegments={removedSegments}
            onSeek={(time) => {
              if (videoRef.current) videoRef.current.currentTime = time;
            }}
          />
        </div>

        {/* Right panel: Settings */}
        <aside className="w-80 border-l border-outline-variant/10 bg-surface-container-high p-6 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="mb-8">
            <h2 className="text-sm font-bold tracking-widest text-on-surface uppercase mb-1">
              Silence Detection
            </h2>
            <p className="text-xs text-on-surface-variant">
              Automatically identify and remove dead air from your footage.
            </p>
          </div>

          <div className="space-y-8 flex-1">
            <Slider
              label="Threshold (dB)"
              value={detectionSettings.noiseThreshold}
              min={-60}
              max={0}
              step={1}
              displayValue={`${detectionSettings.noiseThreshold} dB`}
              onChange={(v) => updateDetectionSettings({ noiseThreshold: v })}
            />

            <Slider
              label="Min Duration (s)"
              value={detectionSettings.minDuration}
              min={0.1}
              max={3}
              step={0.1}
              displayValue={`${detectionSettings.minDuration}s`}
              onChange={(v) => updateDetectionSettings({ minDuration: v })}
            />

            <div className="pt-4 space-y-4">
              <Toggle
                label="Fade Out/In"
                checked={detectionSettings.fadeEnabled}
                onChange={(v) => updateDetectionSettings({ fadeEnabled: v })}
              />
              <Toggle
                label="Detect Breath"
                checked={detectionSettings.detectBreath}
                onChange={(v) => updateDetectionSettings({ detectBreath: v })}
              />
              <div className="pt-2">
                <label className="text-xs font-semibold text-on-surface-variant mb-2 block">
                  Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateDetectionSettings({ mode: "cut" })}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                      detectionSettings.mode === "cut"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    Cut Silence
                  </button>
                  <button
                    onClick={() => updateDetectionSettings({ mode: "speed" })}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                      detectionSettings.mode === "speed"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    Time Warp
                  </button>
                </div>
              </div>

              {detectionSettings.mode === "speed" && (
                <Slider
                  label="Speed Multiplier"
                  value={detectionSettings.speedMultiplier}
                  min={1.5}
                  max={6}
                  step={0.5}
                  displayValue={`${detectionSettings.speedMultiplier}x`}
                  onChange={(v) =>
                    updateDetectionSettings({ speedMultiplier: v })
                  }
                />
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleRedetect}
              disabled={isRedetecting}
            >
              {isRedetecting ? "Re-detecting..." : "Re-detect Silence"}
            </Button>
          </div>

          {/* Action area */}
          <div className="mt-auto pt-6 border-t border-outline-variant/10">
            <div className="p-4 bg-surface-container-highest rounded-lg mb-4 border border-outline-variant/5">
              <div className="flex items-center gap-3 mb-2">
                <Icon name="auto_fix_high" className="text-secondary text-xl" />
                <span className="text-xs font-bold text-on-surface">
                  Detected: {gapCount} Gaps
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                Applying these settings will reduce video length from{" "}
                {formatTime(originalDuration)} to {formatTime(estimatedDuration)}.
              </p>
            </div>
            <Button
              variant="primary"
              className="w-full py-3"
              onClick={handleAutoCut}
              disabled={isCutting || removedSegments.length === 0}
            >
              <Icon name="auto_fix_high" className="text-lg" />
              {detectionSettings.mode === "speed"
                ? "Apply Time Warp"
                : "Auto Cut Silence"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
