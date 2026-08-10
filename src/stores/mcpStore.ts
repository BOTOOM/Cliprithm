import { create } from "zustand";
import { getSetting, setSetting } from "../services/database";
import {
  startMcpBridge,
  startMcpServer,
  stopMcpServer,
  type McpServerResponse,
} from "../services/mcpBridge";
import { isDesktopRuntime } from "../lib/runtime";

export const DEFAULT_MCP_PORT = 47_831;

type McpStatus = "starting" | "running" | "stopped" | "error";

interface McpState {
  enabled: boolean;
  port: number;
  status: McpStatus;
  url: string | null;
  token: string | null;
  error: string | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setPort: (port: number) => Promise<void>;
  shutdown: () => Promise<void>;
}

let bridgeUnlisten: (() => void) | null = null;
let bridgeStartPromise: Promise<(() => void)> | null = null;
let lifecycleUsers = 0;
let lifecycleQueue: Promise<void> = Promise.resolve();

function enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const queued = lifecycleQueue.then(operation, operation);
  lifecycleQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

async function ensureMcpBridge(): Promise<void> {
  if (bridgeUnlisten) return;
  if (bridgeStartPromise) {
    await bridgeStartPromise;
    return;
  }

  const promise = startMcpBridge();
  bridgeStartPromise = promise;
  try {
    bridgeUnlisten = await promise;
  } finally {
    if (bridgeStartPromise === promise) bridgeStartPromise = null;
  }
}

export function statusFromResponse(response: Pick<McpServerResponse, "running" | "url" | "token" | "error">): Pick<McpState, "status" | "url" | "token" | "error"> {
  return {
    status: response.running ? "running" : response.error ? "error" : "stopped",
    url: response.url,
    token: response.token,
    error: response.error,
  };
}

export const useMcpStore = create<McpState>((set, get) => ({
  enabled: true,
  port: DEFAULT_MCP_PORT,
  status: "stopped",
  url: null,
  token: null,
  error: null,
  initialized: false,

  initialize: async () => {
    if (!isDesktopRuntime()) return;
    lifecycleUsers += 1;
    await enqueueLifecycle(async () => {
      if (get().initialized) return;

      set({ status: "starting", error: null });
      try {
        await ensureMcpBridge();
        const storedEnabled = await getSetting("mcp.enabled");
        const storedPort = await getSetting("mcp.port");
        const enabled = storedEnabled !== "false";
        const port = storedPort ? Number.parseInt(storedPort, 10) : DEFAULT_MCP_PORT;
        const normalizedPort = Number.isInteger(port) && port > 0 && port <= 65_535 ? port : DEFAULT_MCP_PORT;
        set({ enabled, port: normalizedPort });

        if (!enabled) {
          set({ initialized: true, status: "stopped", url: null, token: null, error: null });
          return;
        }

        const response = await startMcpServer(normalizedPort);
        set({ initialized: true, ...statusFromResponse(response) });
      } catch (error) {
        set({
          initialized: false,
          status: "error",
          url: null,
          token: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  },

  setEnabled: async (enabled) => {
    if (!isDesktopRuntime()) {
      set({ enabled });
      return;
    }
    await enqueueLifecycle(async () => {
      const previous = get().enabled;
      set({ enabled, status: "starting", error: null });
      try {
        await setSetting("mcp.enabled", String(enabled));
        if (enabled) {
          await ensureMcpBridge();
          const response = await startMcpServer(get().port);
          set({ initialized: true, ...statusFromResponse(response) });
        } else {
          const response = await stopMcpServer();
          set({ initialized: false, ...statusFromResponse(response) });
        }
      } catch (error) {
        await setSetting("mcp.enabled", String(previous)).catch(() => undefined);
        set({
          enabled: previous,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  },

  setPort: async (port) => {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return;
    if (!isDesktopRuntime()) {
      set({ port });
      return;
    }
    await enqueueLifecycle(async () => {
      const previous = get().port;
      const enabled = get().enabled;
      set({ port, status: enabled ? "starting" : "stopped", error: null });
      try {
        await setSetting("mcp.port", String(port));
        if (enabled) {
          await ensureMcpBridge();
          const response = await startMcpServer(port);
          set({ initialized: true, ...statusFromResponse(response) });
        }
      } catch (error) {
        await setSetting("mcp.port", String(previous)).catch(() => undefined);
        set({
          port: previous,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  },

  shutdown: async () => {
    lifecycleUsers = Math.max(0, lifecycleUsers - 1);
    if (!isDesktopRuntime() || lifecycleUsers > 0) return;
    await enqueueLifecycle(async () => {
      if (lifecycleUsers > 0) return;

      bridgeUnlisten?.();
      bridgeUnlisten = null;
      if (!get().initialized) return;
      try {
        await stopMcpServer();
      } finally {
        set({ initialized: false, status: "stopped", url: null, token: null });
      }
    });
  },
}));

export type { McpStatus };
