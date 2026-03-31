/**
 * SilenCut Logger
 *
 * En DEV  → logs en consola del navegador (DevTools) + backend Tauri
 * En PROD → solo logs WARN/ERROR se envían al archivo via plugin-log
 */

import { debug, info, warn, error } from "@tauri-apps/plugin-log";

const IS_DEV = import.meta.env.DEV;

type LogLevel = "debug" | "info" | "warn" | "error";

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

function formatMessage(tag: string, ...args: unknown[]): string {
  return `${tag} ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")}`;
}

export const log = {
  debug(tag: string, ...args: unknown[]) {
    consoleLog("debug", tag, ...args);
    if (IS_DEV) {
      debug(formatMessage(tag, ...args)).catch(() => {});
    }
  },

  info(tag: string, ...args: unknown[]) {
    consoleLog("info", tag, ...args);
    info(formatMessage(tag, ...args)).catch(() => {});
  },

  warn(tag: string, ...args: unknown[]) {
    consoleLog("warn", tag, ...args);
    warn(formatMessage(tag, ...args)).catch(() => {});
  },

  error(tag: string, ...args: unknown[]) {
    consoleLog("error", tag, ...args);
    error(formatMessage(tag, ...args)).catch(() => {});
  },
};
