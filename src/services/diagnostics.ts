import { appLogDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, exists, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { APP_LINKS, APP_NAME, APP_VERSION } from "../lib/appInfo";
import { isDesktopRuntime } from "../lib/runtime";
import type { LogEntry } from "../lib/logger";
import type { DiagnosticsReportInput, LogFileSnapshot } from "../types/diagnostics";

const LOG_FILE_NAME = "cliprithm.log";

function tailLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.slice(-maxLines).join("\n");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function formatValue(value: string | null): string {
  return value && value.length > 0 ? value : "n/a";
}

export async function resolveLogFilePath(): Promise<string | null> {
  if (!isDesktopRuntime()) {
    return null;
  }

  return join(await appLogDir(), LOG_FILE_NAME);
}

export async function readLogFileSnapshot(maxLines = 250): Promise<LogFileSnapshot> {
  const resolvedPath = await resolveLogFilePath();

  if (!isDesktopRuntime()) {
    return {
      path: resolvedPath,
      exists: false,
      content: "",
      excerpt: "",
      size: null,
      modifiedAt: null,
      readError: null,
    };
  }

  try {
    const logExists = await exists(LOG_FILE_NAME, { baseDir: BaseDirectory.AppLog });
    if (!logExists) {
      return {
        path: resolvedPath,
        exists: false,
        content: "",
        excerpt: "",
        size: null,
        modifiedAt: null,
        readError: null,
      };
    }

    const [content, fileInfo] = await Promise.all([
      readTextFile(LOG_FILE_NAME, { baseDir: BaseDirectory.AppLog }),
      stat(LOG_FILE_NAME, { baseDir: BaseDirectory.AppLog }),
    ]);

    return {
      path: resolvedPath,
      exists: true,
      content,
      excerpt: tailLines(content, maxLines),
      size: fileInfo.size,
      modifiedAt: fileInfo.mtime?.toISOString() ?? null,
      readError: null,
    };
  } catch (readError) {
    return {
      path: resolvedPath,
      exists: false,
      content: "",
      excerpt: "",
      size: null,
      modifiedAt: null,
      readError: readError instanceof Error ? readError.message : String(readError),
    };
  }
}

export function formatLogEntries(entries: LogEntry[], maxEntries = 120): string {
  return entries
    .slice(-maxEntries)
    .map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.tag} ${entry.message}`)
    .join("\n");
}

export function buildDiagnosticsReport(input: DiagnosticsReportInput): string {
  const reportSections = [
    `${APP_NAME} diagnostics report`,
    "",
    "## Environment",
    `- App version: ${APP_VERSION}`,
    `- Runtime: ${input.desktopRuntime ? "desktop" : "browser"}`,
    `- User agent: ${navigator.userAgent}`,
    "",
    "## App state",
    `- Current view: ${input.currentView}`,
    `- Active side tab: ${input.activeSideTab}`,
    `- Media server port: ${input.mediaServerPort || "n/a"}`,
    `- Source file: ${formatValue(input.filePath)}`,
    `- Processed file: ${formatValue(input.processedFilePath)}`,
    "",
    "## Fatal error",
    input.fatalError
      ? [
          `- Source: ${input.fatalError.source}`,
          `- Time: ${input.fatalError.timestamp}`,
          `- Name: ${input.fatalError.name}`,
          `- Message: ${input.fatalError.message}`,
          `- Stack: ${formatValue(input.fatalError.stack)}`,
          `- Component stack: ${formatValue(input.fatalError.componentStack)}`,
        ].join("\n")
      : "- No fatal error captured.",
    "",
    "## Log file",
    `- Path: ${formatValue(input.logFile.path)}`,
    `- Exists: ${input.logFile.exists ? "yes" : "no"}`,
    `- Last modified: ${formatValue(input.logFile.modifiedAt)}`,
    `- Size: ${input.logFile.size ?? "n/a"} bytes`,
    `- Read error: ${formatValue(input.logFile.readError)}`,
    "",
    "## Recent runtime logs",
    "```text",
    input.logFile.excerpt || formatLogEntries(input.memoryLogs) || "No logs captured yet.",
    "```",
  ];

  return reportSections.join("\n");
}

export function buildBugReportUrl(input: DiagnosticsReportInput): string {
  const title = input.fatalError
    ? `[Bug]: ${truncate(input.fatalError.message, 80)}`
    : "[Bug]: Runtime diagnostics report";
  const condensedLogs = truncate(
    input.logFile.excerpt || formatLogEntries(input.memoryLogs, 20) || "No logs captured yet.",
    1800
  );

  const body = [
    "## Summary",
    input.fatalError
      ? `A fatal runtime error was captured in ${APP_NAME}.`
      : `A runtime issue was observed in ${APP_NAME}.`,
    "",
    "## Environment",
    `- App version: ${APP_VERSION}`,
    `- Runtime: ${input.desktopRuntime ? "desktop" : "browser"}`,
    `- Current view: ${input.currentView}`,
    `- Active side tab: ${input.activeSideTab}`,
    `- Media server port: ${input.mediaServerPort || "n/a"}`,
    "",
    "## Fatal error",
    input.fatalError
      ? [
          `- Source: ${input.fatalError.source}`,
          `- Message: ${input.fatalError.message}`,
          `- Stack: ${formatValue(input.fatalError.stack)}`,
        ].join("\n")
      : "- No fatal error captured.",
    "",
    "## Recent logs",
    "```text",
    condensedLogs,
    "```",
    "",
    "## Additional context",
    "Paste the full diagnostics report copied from the Diagnostics panel or fatal error screen here.",
  ].join("\n");

  const params = new URLSearchParams({
    template: "bug_report.yml",
    title,
    body,
  });

  return `${APP_LINKS.bugReportBase}?${params.toString()}`;
}
