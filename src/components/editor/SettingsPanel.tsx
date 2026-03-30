import { useCaptionsStore, PROVIDER_INFO } from "../../stores/captionsStore";
import { Icon } from "../ui/Icon";
import { Toggle } from "../ui/Toggle";
import type { CaptionProvider } from "../../types";

export function SettingsPanel() {
  const {
    enabled,
    provider,
    apiKey,
    model,
    burnIn,
    ollamaUrl,
    lmStudioUrl,
    setEnabled,
    setProvider,
    setApiKey,
    setModel,
    setBurnIn,
    setOllamaUrl,
    setLmStudioUrl,
  } = useCaptionsStore();

  const providerInfo = PROVIDER_INFO[provider];
  const isLocal = provider === "ollama" || provider === "lmstudio";

  return (
    <div className="flex-1 flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">
      <h2 className="text-sm font-bold tracking-widest text-on-surface uppercase mb-6">
        Settings
      </h2>

      {/* Captions Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
              Captions Beta
            </h3>
            <p className="text-[10px] text-on-surface-variant mt-1">
              Generate transcription and captions from your video audio.
            </p>
          </div>
          <Toggle label="" checked={enabled} onChange={setEnabled} />
        </div>

        {enabled && (
          <>
            {/* Provider Selection */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Provider
              </label>
              <div className="space-y-2">
                {(Object.keys(PROVIDER_INFO) as CaptionProvider[]).map((p) => {
                  const info = PROVIDER_INFO[p];
                  const isActive = provider === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        isActive
                          ? "bg-surface-container-highest border border-primary/40"
                          : "bg-surface-container-high border border-transparent hover:border-outline-variant/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          name={
                            p === "ollama" || p === "lmstudio"
                              ? "computer"
                              : "cloud"
                          }
                          className={`text-sm ${isActive ? "text-primary" : "text-on-surface-variant"}`}
                        />
                        <span
                          className={`text-xs font-bold ${isActive ? "text-on-surface" : "text-on-surface-variant"}`}
                        >
                          {info.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-1 ml-6">
                        {info.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* API Key (cloud providers) */}
            {providerInfo.requiresKey && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${providerInfo.label} API key...`}
                  className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2 px-3 text-xs placeholder-on-surface-variant/40"
                />
                <p className="text-[9px] text-on-surface-variant/60">
                  Your key is stored locally and never sent to our servers.
                </p>
              </div>
            )}

            {/* Local server URL */}
            {provider === "ollama" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  Ollama URL
                </label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2 px-3 text-xs"
                />
              </div>
            )}

            {provider === "lmstudio" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  LM Studio URL
                </label>
                <input
                  type="text"
                  value={lmStudioUrl}
                  onChange={(e) => setLmStudioUrl(e.target.value)}
                  className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2 px-3 text-xs"
                />
              </div>
            )}

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Model
              </label>
              <div className="flex flex-col gap-1.5">
                {providerInfo.models.map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-surface-container-highest transition-colors"
                  >
                    <input
                      type="radio"
                      name="caption-model"
                      checked={model === m}
                      onChange={() => setModel(m)}
                      className="text-primary bg-surface-container border-outline-variant"
                    />
                    <span
                      className={`text-xs ${model === m ? "text-on-surface font-medium" : "text-on-surface-variant"}`}
                    >
                      {m}
                    </span>
                  </label>
                ))}
              </div>
              {isLocal && (
                <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/10 mt-2">
                  <div className="flex items-start gap-2">
                    <Icon
                      name="info"
                      className="text-sm text-primary-fixed mt-0.5"
                    />
                    <p className="text-[10px] text-on-surface-variant leading-relaxed">
                      <strong className="text-on-surface">
                        Recommended for low-resource machines:
                      </strong>{" "}
                      Use <code className="text-primary">whisper:base</code> or{" "}
                      <code className="text-primary">whisper:small</code>. These
                      models require ~1-2GB RAM and work on most machines.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Output Options */}
            <div className="space-y-3 pt-4 border-t border-outline-variant/10">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Output
              </label>
              <Toggle
                label="Burn-in captions on export"
                checked={burnIn}
                onChange={setBurnIn}
              />
              <p className="text-[9px] text-on-surface-variant/60">
                Generated captions will be exported as both SRT and WebVTT
                files. Enable burn-in to embed them directly in the video.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
