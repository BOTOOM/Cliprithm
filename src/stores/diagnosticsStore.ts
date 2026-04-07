import { create } from "zustand";
import { log } from "../lib/logger";
import { readLogFileSnapshot } from "../services/diagnostics";
import type { FatalErrorDetails, FatalErrorSource, LogFileSnapshot } from "../types/diagnostics";

const EMPTY_LOG_FILE: LogFileSnapshot = {
  path: null,
  exists: false,
  content: "",
  excerpt: "",
  size: null,
  modifiedAt: null,
  readError: null,
};

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join(": ");
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  return String(value);
}

export function createFatalErrorDetails(
  source: FatalErrorSource,
  error: unknown,
  componentStack: string | null = null
): FatalErrorDetails {
  if (error instanceof Error) {
    return {
      source,
      name: error.name || "Error",
      message: error.message || "Unknown fatal error",
      stack: error.stack ?? null,
      componentStack,
      timestamp: new Date().toISOString(),
      raw: stringifyUnknown(error),
    };
  }

  return {
    source,
    name: "UnknownError",
    message: stringifyUnknown(error),
    stack: null,
    componentStack,
    timestamp: new Date().toISOString(),
    raw: stringifyUnknown(error),
  };
}

interface DiagnosticsState {
  fatalError: FatalErrorDetails | null;
  logFile: LogFileSnapshot;
  logFileLoading: boolean;
  refreshLogFile: () => Promise<void>;
  captureFatalError: (
    source: FatalErrorSource,
    error: unknown,
    componentStack?: string | null
  ) => void;
  clearFatalError: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  fatalError: null,
  logFile: EMPTY_LOG_FILE,
  logFileLoading: false,
  refreshLogFile: async () => {
    set({ logFileLoading: true });
    const logFile = await readLogFileSnapshot();
    set({ logFile, logFileLoading: false });
  },
  captureFatalError: (source, error, componentStack = null) => {
    const fatalError = createFatalErrorDetails(source, error, componentStack);
    log.error("[fatal]", fatalError.source, fatalError.message, fatalError.stack ?? "");
    set({ fatalError });
  },
  clearFatalError: () => set({ fatalError: null }),
}));
