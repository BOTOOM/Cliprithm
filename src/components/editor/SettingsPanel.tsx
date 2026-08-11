import { useEffect, useMemo, useRef, useState } from "react";
import { useCaptionsStore, PROVIDER_INFO } from "../../stores/captionsStore";
import { copyTextToClipboard } from "../../lib/clipboard";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../ui/Icon";
import { Toggle } from "../ui/Toggle";
import type { CaptionProvider } from "../../types";
import { useMcpStore } from "../../stores/mcpStore";

interface CopyableMcpValueProps {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
}

function CopyableMcpValue({
  label,
  value,
  copyLabel,
  copiedLabel,
  copied,
  onCopy,
  disabled = false,
}: CopyableMcpValueProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-surface-container-lowest px-2.5 py-2 text-[10px] text-on-surface">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          disabled={disabled}
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name={copied ? "check" : "content_copy"} className="text-base" />
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { t } = useI18n();
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
  const {
    enabled: mcpEnabled,
    port: mcpPort,
    status: mcpStatus,
    url: mcpUrl,
    token: mcpToken,
    error: mcpError,
    setEnabled: setMcpEnabled,
    setPort: setMcpPort,
  } = useMcpStore();
  const [copiedMcpValue, setCopiedMcpValue] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mcpEndpoint = mcpUrl ?? `http://127.0.0.1:${mcpPort}/mcp`;
  const mcpAuthorization = mcpToken ? `Bearer ${mcpToken}` : "Bearer YOUR_CLIPRITHM_MCP_TOKEN";

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const mcpExamples = useMemo(() => [
    {
      id: "claude",
      label: t("settingsPanel.mcpClaude"),
      description: t("settingsPanel.mcpClaudeDescription"),
      location: t("settingsPanel.mcpClaudeLocation"),
      config: JSON.stringify({
        mcpServers: {
          cliprithm: {
            command: "npx",
            args: [
              "-y",
              "mcp-remote",
              mcpEndpoint,
              "--header",
              "Authorization:${CLIPRITHM_MCP_AUTH}",
            ],
            env: { CLIPRITHM_MCP_AUTH: mcpAuthorization },
          },
        },
      }, null, 2),
    },
    {
      id: "vscode",
      label: t("settingsPanel.mcpVsCode"),
      description: t("settingsPanel.mcpVsCodeDescription"),
      location: t("settingsPanel.mcpVsCodeLocation"),
      config: JSON.stringify({
        servers: {
          cliprithm: {
            type: "http",
            url: mcpEndpoint,
            headers: { Authorization: mcpAuthorization },
          },
        },
      }, null, 2),
    },
    {
      id: "devin",
      label: t("settingsPanel.mcpDevin"),
      description: t("settingsPanel.mcpDevinDescription"),
      location: t("settingsPanel.mcpDevinLocation"),
      config: JSON.stringify({
        mcpServers: {
          cliprithm: {
            url: mcpEndpoint,
            transport: "http",
            headers: { Authorization: mcpAuthorization },
          },
        },
      }, null, 2),
    },
  ], [mcpAuthorization, mcpEndpoint, t]);

  const copyMcpValue = async (key: string, value: string) => {
    try {
      await copyTextToClipboard(value);
      setCopiedMcpValue(key);
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = setTimeout(() => setCopiedMcpValue(null), 1800);
    } catch {
      setCopiedMcpValue(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">
      <h2 className="text-sm font-bold tracking-widest text-on-surface uppercase mb-6">
        {t("settingsPanel.settings")}
      </h2>

      {/* MCP Section */}
      <section className="mb-8 space-y-4 border-b border-outline-variant/10 pb-6">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">
            {t("settingsPanel.mcpServer")}
          </h3>
          <p className="mt-1 text-[10px] text-on-surface-variant">
            {t("settingsPanel.mcpDescription")}
          </p>
        </div>
        <Toggle
          label={t("settingsPanel.mcpEnabled")}
          checked={mcpEnabled}
          onChange={(value) => void setMcpEnabled(value)}
        />
        <div className="space-y-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            {t("settingsPanel.mcpPort")}
          </label>
          <input
            type="number"
            min={1}
            max={65535}
            value={mcpPort}
            onChange={(event) => void setMcpPort(Number(event.target.value))}
            className="w-full rounded-md border-0 bg-surface-container-lowest px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary"
            disabled={!mcpEnabled}
          />
        </div>
        <p className="break-words text-[10px] text-on-surface-variant" aria-live="polite">
          {mcpStatus === "running" && mcpUrl
            ? t("settingsPanel.mcpRunning", { url: mcpUrl })
            : mcpStatus === "starting"
              ? t("settingsPanel.mcpStarting")
              : mcpStatus === "error" && mcpError
                ? t("settingsPanel.mcpError", { error: mcpError })
                : t("settingsPanel.mcpStopped")}
        </p>

        <div className="space-y-4 rounded-lg bg-surface-container p-3">
          <div className="flex items-center gap-2">
            <Icon name="hub" className="text-sm text-primary" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                {t("settingsPanel.mcpConnection")}
              </p>
              <p className="mt-0.5 text-[9px] text-on-surface-variant">
                {t("settingsPanel.mcpConnectionDescription")}
              </p>
            </div>
          </div>
          <CopyableMcpValue
            label={t("settingsPanel.mcpUrl")}
            value={mcpEndpoint}
            copyLabel={t("settingsPanel.mcpCopyUrl")}
            copiedLabel={t("settingsPanel.mcpCopied")}
            copied={copiedMcpValue === "url"}
            onCopy={() => void copyMcpValue("url", mcpEndpoint)}
          />
          {mcpStatus === "running" && mcpToken ? (
            <CopyableMcpValue
              label={t("settingsPanel.mcpToken")}
              value={mcpToken}
              copyLabel={t("settingsPanel.mcpCopyToken")}
              copiedLabel={t("settingsPanel.mcpCopied")}
              copied={copiedMcpValue === "token"}
              onCopy={() => void copyMcpValue("token", mcpToken)}
            />
          ) : (
            <p className="text-[10px] text-on-surface-variant">
              {t("settingsPanel.mcpTokenUnavailable")}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
            <dt className="text-on-surface-variant">{t("settingsPanel.mcpTransport")}</dt>
            <dd className="text-right font-medium text-on-surface">{t("settingsPanel.mcpTransportValue")}</dd>
            <dt className="text-on-surface-variant">{t("settingsPanel.mcpAuthentication")}</dt>
            <dd className="text-right font-medium text-on-surface">{t("settingsPanel.mcpAuthenticationValue")}</dd>
            <dt className="text-on-surface-variant">{t("settingsPanel.mcpBinding")}</dt>
            <dd className="text-right font-medium text-on-surface">{t("settingsPanel.mcpBindingValue")}</dd>
          </dl>
        </div>

        <details className="group rounded-lg border border-outline-variant/10 bg-surface-container-low">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Icon name="settings_ethernet" className="text-sm text-secondary" />
              {t("settingsPanel.mcpSetupExamples")}
            </span>
            <Icon name="expand_more" className="text-base text-on-surface-variant transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-outline-variant/10 p-3">
            <p className="text-[10px] leading-relaxed text-on-surface-variant">
              {t("settingsPanel.mcpSetupDescription")}
            </p>
            <p className="text-[9px] text-on-surface-variant/70">
              {t("settingsPanel.mcpConfigSecurity")}
            </p>
            {mcpExamples.map((example) => (
              <details key={example.id} className="rounded-md border border-outline-variant/10 bg-surface-container">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[10px] font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
                  <span>{example.label}</span>
                  <Icon name="expand_more" className="text-sm text-on-surface-variant" />
                </summary>
                <div className="space-y-2 border-t border-outline-variant/10 p-3">
                  <p className="text-[10px] leading-relaxed text-on-surface-variant">{example.description}</p>
                  <p className="text-[9px] text-on-surface-variant">
                    {example.location}
                  </p>
                  <div className="relative">
                    <pre className="max-h-64 overflow-auto rounded-md bg-surface-container-lowest p-3 pr-12 text-[9px] leading-relaxed text-on-surface">
                      {example.config}
                    </pre>
                    <button
                      type="button"
                      onClick={() => void copyMcpValue(`config-${example.id}`, example.config)}
                      aria-label={copiedMcpValue === `config-${example.id}` ? t("settingsPanel.mcpCopied") : t("settingsPanel.mcpCopyConfig")}
                      title={copiedMcpValue === `config-${example.id}` ? t("settingsPanel.mcpCopied") : t("settingsPanel.mcpCopyConfig")}
                      className="absolute right-2 top-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface active:scale-[0.96]"
                    >
                      <Icon name={copiedMcpValue === `config-${example.id}` ? "check" : "content_copy"} className="text-base" />
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </details>
        <p className="text-[9px] text-on-surface-variant/60">
          {t("settingsPanel.mcpSecurity")}
        </p>
      </section>

      {/* Captions Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
              <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                {t("settingsPanel.captionsBeta")}
              </h3>
              <p className="text-[10px] text-on-surface-variant mt-1">
                {t("settingsPanel.captionsDescription")}
              </p>
          </div>
          <Toggle label="" checked={enabled} onChange={setEnabled} />
        </div>

        {enabled && (
          <>
            {/* Provider Selection */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("settingsPanel.provider")}
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
                  {t("settingsPanel.apiKey")}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                   placeholder={t("settingsPanel.enterApiKey", { provider: providerInfo.label })}
                  className="w-full bg-surface-container-lowest border-0 rounded-md focus:ring-1 focus:ring-primary text-on-surface py-2 px-3 text-xs placeholder-on-surface-variant/40"
                />
                <p className="text-[9px] text-on-surface-variant/60">
                  {t("settingsPanel.keyStoredLocally")}
                </p>
              </div>
            )}

            {/* Local server URL */}
            {provider === "ollama" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("settingsPanel.ollamaUrl")}
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
                  {t("settingsPanel.lmStudioUrl")}
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
                  {t("settingsPanel.model")}
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
                         {t("settingsPanel.recommended")}
                        </strong>{" "}
                        {t("settingsPanel.localModelRecommendation")}
                     </p>
                  </div>
                </div>
              )}
            </div>

            {/* Output Options */}
            <div className="space-y-3 pt-4 border-t border-outline-variant/10">
              <label className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                {t("settingsPanel.output")}
              </label>
              <Toggle
                label={t("settingsPanel.burnIn")}
                checked={burnIn}
                onChange={setBurnIn}
              />
              <p className="text-[9px] text-on-surface-variant/60">
                {t("settingsPanel.outputDescription")}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
