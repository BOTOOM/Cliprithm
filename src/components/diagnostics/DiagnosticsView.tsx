import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";
import { APP_NAME, APP_VERSION, openExternalUrl, revealPathInFileManager } from "../../lib/appInfo";
import { copyTextToClipboard } from "../../lib/clipboard";
import { getRecentLogEntries, subscribeToLogEntries } from "../../lib/logger";
import { isDesktopRuntime } from "../../lib/runtime";
import { useProjectStore } from "../../stores/projectStore";
import { useDiagnosticsStore } from "../../stores/diagnosticsStore";
import { buildBugReportUrl, buildDiagnosticsReport, formatLogEntries } from "../../services/diagnostics";

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "n/a";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DiagnosticsView() {
  const { t } = useI18n();
  const desktopRuntime = isDesktopRuntime();
  const logFile = useDiagnosticsStore((state) => state.logFile);
  const logFileLoading = useDiagnosticsStore((state) => state.logFileLoading);
  const fatalError = useDiagnosticsStore((state) => state.fatalError);
  const refreshLogFile = useDiagnosticsStore((state) => state.refreshLogFile);
  const { currentView, activeSideTab, filePath, processedFilePath, mediaServerPort } =
    useProjectStore(
      useShallow((state) => ({
        currentView: state.currentView,
        activeSideTab: state.activeSideTab,
        filePath: state.filePath,
        processedFilePath: state.processedFilePath,
        mediaServerPort: state.mediaServerPort,
      }))
    );
  const [memoryLogs, setMemoryLogs] = useState(() => getRecentLogEntries(120));

  useEffect(
    () => subscribeToLogEntries((entries) => setMemoryLogs(entries.slice(-120))),
    []
  );

  useEffect(() => {
    void refreshLogFile();
  }, [refreshLogFile]);

  const reportInput = useMemo(
    () => ({
      fatalError,
      logFile,
      memoryLogs,
      filePath,
      processedFilePath,
      mediaServerPort,
      currentView,
      activeSideTab,
      desktopRuntime,
    }),
    [
      activeSideTab,
      currentView,
      desktopRuntime,
      fatalError,
      filePath,
      logFile,
      mediaServerPort,
      memoryLogs,
      processedFilePath,
    ]
  );

  const handleCopyDiagnostics = async () => {
    await copyTextToClipboard(buildDiagnosticsReport(reportInput));
  };

  const handleCopyLogs = async () => {
    const content = logFile.excerpt || formatLogEntries(memoryLogs, 120) || t("diagnostics.noLogs");
    await copyTextToClipboard(content);
  };

  const handleReportIssue = async () => {
    await openExternalUrl(buildBugReportUrl(reportInput));
  };

  const handleRevealLogs = async () => {
    if (!logFile.path) {
      return;
    }

    await revealPathInFileManager(logFile.path);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-primary/10 to-surface-container-high border border-outline-variant/20 p-6 md:p-7">
          <div className="flex flex-col lg:flex-row gap-5 lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.28em] border border-primary/20 bg-primary/10 text-primary">
                <Icon name="monitor_heart" className="text-sm" />
                {APP_NAME}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-on-surface">{t("diagnostics.title")}</h1>
                <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                  {t("diagnostics.description")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void handleCopyDiagnostics()}>
                <Icon name="content_copy" className="text-base" />
                {t("diagnostics.copyDiagnostics")}
              </Button>
              <Button variant="surface" onClick={() => void handleCopyLogs()}>
                <Icon name="article" className="text-base" />
                {t("diagnostics.copyLogs")}
              </Button>
              <Button variant="surface" onClick={() => void handleReportIssue()}>
                <Icon name="bug_report" className="text-base" />
                {t("diagnostics.reportIssue")}
              </Button>
              <Button
                variant="surface"
                onClick={() => void handleRevealLogs()}
                disabled={!desktopRuntime || !logFile.path}
              >
                <Icon name="folder_open" className="text-base" />
                {t("diagnostics.openLogFolder")}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatusCard
            title={t("diagnostics.appVersion")}
            value={APP_VERSION}
            icon="deployed_code"
            caption={desktopRuntime ? t("diagnostics.desktopRuntime") : t("diagnostics.browserRuntime")}
          />
          <StatusCard
            title={t("diagnostics.mediaServer")}
            value={mediaServerPort ? String(mediaServerPort) : "n/a"}
            icon="dns"
            caption={t("diagnostics.currentViewLabel", { view: currentView })}
          />
          <StatusCard
            title={t("diagnostics.currentProject")}
            value={filePath ?? t("diagnostics.none")}
            icon="movie"
            caption={processedFilePath ?? t("diagnostics.noProcessedFile")}
          />
          <StatusCard
            title={t("diagnostics.fatalState")}
            value={fatalError ? fatalError.message : t("diagnostics.noFatalError")}
            icon={fatalError ? "warning" : "verified"}
            caption={fatalError?.timestamp ?? t("diagnostics.runtimeHealthy")}
          />
        </section>

        <section className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
          <Panel title={t("diagnostics.logFile")} icon="description">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-xs text-on-surface-variant space-y-1">
                <p>{logFile.path ?? t("diagnostics.noLogPath")}</p>
                <p>
                  {t("diagnostics.logMeta", {
                    size: formatBytes(logFile.size),
                    modified: logFile.modifiedAt ?? "n/a",
                  })}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void refreshLogFile()}>
                <Icon name="refresh" className="text-sm" />
                {t("diagnostics.refresh")}
              </Button>
            </div>
            <pre className="rounded-2xl bg-surface-container-high border border-outline-variant/10 p-4 text-xs whitespace-pre-wrap break-words text-on-surface-variant max-h-[28rem] overflow-y-auto custom-scrollbar">
              {logFileLoading
                ? t("diagnostics.loadingLogs")
                : logFile.readError
                  ? t("diagnostics.readError", { error: logFile.readError })
                  : logFile.excerpt || t("diagnostics.noLogFile")}
            </pre>
          </Panel>

          <div className="space-y-6">
            <Panel title={t("diagnostics.recentRuntimeLogs")} icon="receipt_long">
              <pre className="rounded-2xl bg-surface-container-high border border-outline-variant/10 p-4 text-xs whitespace-pre-wrap break-words text-on-surface-variant max-h-80 overflow-y-auto custom-scrollbar">
                {formatLogEntries(memoryLogs, 80) || t("diagnostics.noLogs")}
              </pre>
            </Panel>

            <Panel title={t("diagnostics.lastFatalError")} icon="warning">
              <pre className="rounded-2xl bg-surface-container-high border border-outline-variant/10 p-4 text-xs whitespace-pre-wrap break-words text-on-surface-variant max-h-64 overflow-y-auto custom-scrollbar">
                {fatalError
                  ? [fatalError.message, fatalError.stack, fatalError.componentStack]
                      .filter(Boolean)
                      .join("\n\n")
                  : t("diagnostics.noFatalErrorDetails")}
              </pre>
            </Panel>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  value,
  caption,
  icon,
}: {
  title: string;
  value: string;
  caption: string;
  icon: string;
}) {
  return (
    <div className="rounded-3xl bg-surface-container border border-outline-variant/10 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon name={icon} className="text-xl" />
        </div>
        <p className="text-xs uppercase tracking-[0.24em] text-on-surface-variant">{title}</p>
      </div>
      <p className="text-sm text-on-surface break-words leading-relaxed">{value}</p>
      <p className="text-xs text-on-surface-variant mt-3">{caption}</p>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-surface-container border border-outline-variant/10 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon name={icon} className="text-xl" />
        </div>
        <h2 className="text-lg font-medium text-on-surface">{title}</h2>
      </div>
      {children}
    </section>
  );
}
