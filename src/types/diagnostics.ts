import type { LogEntry } from "../lib/logger";

export type FatalErrorSource = "render" | "window-error" | "unhandledrejection";

export interface FatalErrorDetails {
  source: FatalErrorSource;
  name: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  timestamp: string;
  raw: string;
}

export interface LogFileSnapshot {
  path: string | null;
  exists: boolean;
  content: string;
  excerpt: string;
  size: number | null;
  modifiedAt: string | null;
  readError: string | null;
}

export interface DiagnosticsReportInput {
  fatalError: FatalErrorDetails | null;
  logFile: LogFileSnapshot;
  memoryLogs: LogEntry[];
  filePath: string | null;
  processedFilePath: string | null;
  mediaServerPort: number;
  currentView: string;
  activeSideTab: string;
  desktopRuntime: boolean;
}
