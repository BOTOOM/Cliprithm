import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../../stores/projectStore";
import { getVideoMetadata, detectSilence } from "../../services/tauriCommands";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

export function EmptyState() {
  const {
    setFilePath,
    setVideoMetadata,
    setView,
    setDetectionResult,
    setProgress,
    detectionSettings,
  } = useProjectStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (path: string) => {
      try {
        setError(null);
        setFilePath(path);
        setView("processing");
        setProgress({
          percent: 10,
          stage: "metadata",
          message: "Reading video metadata...",
        });

        const metadata = await getVideoMetadata(path);
        setVideoMetadata(metadata);

        setProgress({
          percent: 30,
          stage: "analyzing",
          message: "Detecting silence...",
        });

        const result = await detectSilence(
          path,
          detectionSettings.noiseThreshold,
          detectionSettings.minDuration
        );
        setDetectionResult(result);

        setProgress({
          percent: 100,
          stage: "complete",
          message: `Found ${result.segments.length} silent segments`,
        });

        setTimeout(() => setView("editor"), 1500);
      } catch (err) {
        setError(String(err));
        setView("import");
      }
    },
    [
      setFilePath,
      setVideoMetadata,
      setView,
      setDetectionResult,
      setProgress,
      detectionSettings,
    ]
  );

  const handleBrowse = async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm"] },
      ],
    });
    if (file) {
      handleFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // In Tauri, drag & drop gives us the path
      const path = (file as unknown as { path?: string }).path;
      if (path) handleFile(path);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Media Sidebar */}
      <div className="flex h-full">
        <div className="w-64 bg-surface-container p-4 border-r border-surface-container-high flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-on-surface-variant font-medium uppercase tracking-widest text-xs">
              Media Library
            </h2>
            <Icon
              name="filter_list"
              className="text-on-surface-variant text-sm"
            />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 space-y-4">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
              <Icon name="cloud_off" className="text-outline text-xl" />
            </div>
            <p className="text-xs text-on-surface-variant">
              No media imported yet. Start a new project to see files here.
            </p>
          </div>
        </div>

        {/* Main Drop Zone */}
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-surface-container-low">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`w-full max-w-4xl aspect-video glass-panel rounded-xl flex flex-col items-center justify-center border-2 border-dashed transition-all duration-500 relative group ${
              isDragOver
                ? "border-primary/60 bg-surface-container-high/60"
                : "border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container-high/40"
            }`}
          >
            <div className="relative z-10 flex flex-col items-center text-center max-w-md">
              <div className="mb-8 w-24 h-24 rounded-full bg-surface-container-highest flex items-center justify-center shadow-2xl relative">
                <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl animate-pulse" />
                <Icon
                  name="upload_file"
                  className="text-primary text-5xl relative z-20"
                />
              </div>
              <h1 className="text-2xl font-bold text-on-surface mb-3 tracking-tight">
                Drag & Drop your video here to start removing silence.
              </h1>
              <p className="text-on-surface-variant text-sm mb-10 leading-relaxed px-8">
                Our engine surgically detects and removes audio gaps to make
                your content punchy and professional.
              </p>
              <div className="flex flex-col gap-4 w-full px-12">
                <Button
                  variant="primary"
                  className="w-full py-3"
                  onClick={handleBrowse}
                >
                  Browse Files
                </Button>
              </div>
              {error && (
                <p className="mt-4 text-error text-xs">{error}</p>
              )}
            </div>
            {/* Status indicators */}
            <div className="absolute bottom-8 flex gap-8">
              {["MP4, MOV, MKV", "Up to 4K 60FPS", "Max 2GB"].map((text) => (
                <div
                  key={text}
                  className="flex items-center gap-2 text-[10px] text-on-surface-variant/60 font-medium uppercase tracking-widest"
                >
                  <Icon name="check_circle" className="text-sm" />
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Feature Cards */}
          <div className="mt-12 w-full max-w-4xl grid grid-cols-3 gap-6">
            {[
              {
                icon: "auto_fix_high",
                color: "text-primary-dim",
                title: "Smart Cut",
                desc: "Automatically identifies pauses based on decibel thresholds and breath analysis.",
              },
              {
                icon: "speed",
                color: "text-secondary",
                title: "Time Warp",
                desc: "Accelerate dead air instead of cutting it for a more natural conversational flow.",
              },
              {
                icon: "closed_caption",
                color: "text-tertiary",
                title: "Captions Beta",
                desc: "Generate transcription and captions simultaneously as you process the video.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="p-6 rounded-lg bg-surface-container flex flex-col gap-3 group hover:bg-surface-container-high transition-colors"
              >
                <Icon name={card.icon} className={card.color} />
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  {card.title}
                </h3>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
