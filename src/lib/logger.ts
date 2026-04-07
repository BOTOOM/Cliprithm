/**
 * Cliprithm Logger
 *
 * En DEV  → logs en consola del navegador (DevTools) + backend Tauri
 * En PROD → solo logs WARN/ERROR se envían al archivo via plugin-log
 */

import { debug, info, warn, error } from "@tauri-apps/plugin-log";

const IS_DEV = import.meta.env.DEV;
const MAX_BUFFERED_LOGS = 400;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
}

// Colores por módulo para distinguirlos en DevTools
const MODULE_COLORS: Record<string, string> = {
  "[import]": "#7C3AED",
  "[ffmpeg]": "#0891B2",
  "[silence]": "#D97706",
  "[cut]": "#059669",
  "[export]": "#DB2777",
  "[db]": "#6366F1",
  "[updater]": "#F59E0B",
  "[store]": "#64748B",
};

let logSequence = 0;
const entryBuffer: LogEntry[] = [];
const subscribers = new Set<(entries: LogEntry[]) => void>();

function getColor(tag: string): string {
  for (const [prefix, color] of Object.entries(MODULE_COLORS)) {
    if (tag.startsWith(prefix)) return color;
  }
  return "#94A3B8";
}

function consoleLog(level: LogLevel, tag: string, ...args: unknown[]) {
  if (!IS_DEV) return;

  const color = getColor(tag);
  const prefix = `%c${tag}`;
  const style = `color:${color};font-weight:bold`;

  switch (level) {
    case "debug":
      console.debug(prefix, style, ...args);
      break;
    case "info":
      console.info(prefix, style, ...args);
      break;
    case "warn":
      console.warn(prefix, style, ...args);
      break;
    case "error":
      console.error(prefix, style, ...args);
      break;
  }
}

function stringifyValue(value: unknown): string {
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

function formatMessage(tag: string, ...args: unknown[]): string {
  return `${tag} ${args.map((value) => stringifyValue(value)).join(" ")}`;
}

function pushLogEntry(level: LogLevel, tag: string, ...args: unknown[]): void {
  const entry: LogEntry = {
    id: `${Date.now()}-${logSequence++}`,
    timestamp: new Date().toISOString(),
    level,
    tag,
    message: args.map((value) => stringifyValue(value)).join(" "),
  };

  entryBuffer.push(entry);
  if (entryBuffer.length > MAX_BUFFERED_LOGS) {
    entryBuffer.splice(0, entryBuffer.length - MAX_BUFFERED_LOGS);
  }

  const snapshot = [...entryBuffer];
  subscribers.forEach((subscriber) => subscriber(snapshot));
}

export function getRecentLogEntries(limit = MAX_BUFFERED_LOGS): LogEntry[] {
  return entryBuffer.slice(-limit);
}

export function subscribeToLogEntries(listener: (entries: LogEntry[]) => void): () => void {
  subscribers.add(listener);
  listener([...entryBuffer]);

  return () => {
    subscribers.delete(listener);
  };
}

export const log = {
  debug(tag: string, ...args: unknown[]) {
    pushLogEntry("debug", tag, ...args);
    consoleLog("debug", tag, ...args);
    if (IS_DEV) {
      debug(formatMessage(tag, ...args)).catch(() => {});
    }
  },

  info(tag: string, ...args: unknown[]) {
    pushLogEntry("info", tag, ...args);
    consoleLog("info", tag, ...args);
    info(formatMessage(tag, ...args)).catch(() => {});
  },

  warn(tag: string, ...args: unknown[]) {
    pushLogEntry("warn", tag, ...args);
    consoleLog("warn", tag, ...args);
    warn(formatMessage(tag, ...args)).catch(() => {});
  },

  error(tag: string, ...args: unknown[]) {
    pushLogEntry("error", tag, ...args);
    consoleLog("error", tag, ...args);
    error(formatMessage(tag, ...args)).catch(() => {});
  },
};
