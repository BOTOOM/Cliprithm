import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";
import { APP_NAME } from "../../lib/appInfo";
import { copyTextToClipboard } from "../../lib/clipboard";
import { openExternalUrl, revealPathInFileManager } from "../../lib/appInfo";
import { getRecentLogEntries, subscribeToLogEntries } from "../../lib/logger";
import { isDesktopRuntime } from "../../lib/runtime";
import { useProjectStore } from "../../stores/projectStore";
import { useDiagnosticsStore } from "../../stores/diagnosticsStore";
import { buildBugReportUrl, buildDiagnosticsReport, formatLogEntries } from "../../services/diagnostics";
import type { FatalErrorDetails } from "../../types/diagnostics";

interface FatalErrorScreenProps {
  fallbackError?: FatalErrorDetails | null;
}

export function FatalErrorScreen({ fallbackError = null }: FatalErrorScreenProps) {
  const { t } = useI18n();
  const fatalError = useDiagnosticsStore((state) => state.fatalError) ?? fallbackError;
  const logFile = useDiagnosticsStore((state) => state.logFile);
  const logFileLoading = useDiagnosticsStore((state) => state.logFileLoading);
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
  const [memoryLogs, setMemoryLogs] = useState(() => getRecentLogEntries(80));
  const desktopRuntime = isDesktopRuntime();

  useEffect(
    () => subscribeToLogEntries((entries) => setMemoryLogs(entries.slice(-80))),
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

  const recentLogs = logFile.excerpt || formatLogEntries(memoryLogs, 60) || t("diagnostics.noLogs");

  const handleCopyReport = async () => {
    await copyTextToClipboard(buildDiagnosticsReport(reportInput));
  };

  const handleCopyLogs = async () => {
    await copyTextToClipboard(recentLogs);
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

  const handleRestart = async () => {
    if (!desktopRuntime) {
      return;
    }

    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  };

  return (
    <div className="min-h-screen bg-surface overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="rounded-3xl border border-error/30 bg-gradient-to-br from-error/12 to-surface-container-high p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-error/15 border border-error/30 flex items-center justify-center shrink-0">
              <Icon name="warning" className="text-4xl text-error" filled />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-error/80 mb-2">
                  {APP_NAME}
                </p>
                <h1 className="text-2xl md:text-3xl font-semibold text-on-surface">
                  {t("fatal.title")}
                </h1>
                <p className="text-sm md:text-base text-on-surface-variant mt-2 max-w-2xl leading-relaxed">
                  {t("fatal.description")}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <DetailCard
                  title={t("fatal.errorSource")}
                  value={fatalError?.source ?? "unknown"}
                  icon="bug_report"
                />
                <DetailCard
                  title={t("fatal.timestamp")}
                  value={fatalError?.timestamp ?? "n/a"}
                  icon="schedule"
                />
                <DetailCard
                  title={t("fatal.currentView")}
                  value={currentView}
                  icon="dashboard"
                />
                <DetailCard
                  title={t("fatal.mediaServer")}
                  value={mediaServerPort ? String(mediaServerPort) : "n/a"}
                  icon="dns"
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="primary" onClick={() => void handleCopyReport()}>
                  <Icon name="content_copy" className="text-base" />
                  {t("fatal.copyDiagnostics")}
                </Button>
                <Button variant="surface" onClick={() => void handleCopyLogs()}>
                  <Icon name="article" className="text-base" />
                  {t("fatal.copyLogs")}
                </Button>
                <Button variant="surface" onClick={() => void handleReportIssue()}>
                  <Icon name="open_in_new" className="text-base" />
                  {t("fatal.reportIssue")}
                </Button>
                <Button
                  variant="surface"
                  onClick={() => void handleRevealLogs()}
                  disabled={!logFile.path}
                >
                  <Icon name="folder_open" className="text-base" />
                  {t("fatal.openLogFolder")}
                </Button>
                {desktopRuntime ? (
                  <Button variant="ghost" onClick={() => void handleRestart()}>
                    <Icon name="restart_alt" className="text-base" />
                    {t("fatal.restart")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <SectionPanel title={t("fatal.errorDetails")} icon="error">
          <pre className="text-xs md:text-sm whitespace-pre-wrap break-words text-error max-h-64 overflow-y-auto custom-scrollbar">
            {fatalError
              ? [fatalError.message, fatalError.stack, fatalError.componentStack]
                  .filter(Boolean)
                  .join("\n\n")
              : t("fatal.noErrorDetails")}
          </pre>
        </SectionPanel>

        <SectionPanel title={t("fatal.recentLogs")} icon="receipt_long">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs text-on-surface-variant">
              {logFileLoading ? t("diagnostics.loadingLogs") : logFile.path ?? t("diagnostics.noLogPath")}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void refreshLogFile()}>
              <Icon name="refresh" className="text-sm" />
              {t("diagnostics.refresh")}
            </Button>
          </div>
          <pre className="text-xs whitespace-pre-wrap break-words text-on-surface-variant max-h-80 overflow-y-auto custom-scrollbar">
            {recentLogs}
          </pre>
        </SectionPanel>
      </div>
    </div>
  );
}

function DetailCard({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl bg-surface-container-high border border-outline-variant/10 p-4">
      <div className="flex items-center gap-2 text-on-surface-variant text-xs uppercase tracking-[0.2em] mb-2">
        <Icon name={icon} className="text-sm" />
        <span>{title}</span>
      </div>
      <p className="text-sm text-on-surface break-words">{value}</p>
    </div>
  );
}

function SectionPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-surface-container border border-outline-variant/10 p-5 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon name={icon} className="text-xl" />
        </div>
        <h2 className="text-lg font-medium text-on-surface">{title}</h2>
      </div>
      {children}
    </section>
  );
}
