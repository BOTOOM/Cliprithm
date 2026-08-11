import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(async (key: string) => (key === "mcp.enabled" ? null : null)),
  setSetting: vi.fn(async () => undefined),
  startMcpBridge: vi.fn(async () => vi.fn()),
  startMcpServer: vi.fn(async () => ({
    running: true,
    port: 47_831,
    url: "http://127.0.0.1:47831/mcp",
    token: "mcp-test-token",
    error: null,
  })),
  stopMcpServer: vi.fn(async () => ({
    running: false,
    port: null,
    url: null,
    token: null,
    error: null,
  })),
}));

vi.mock("../lib/runtime", () => ({
  isDesktopRuntime: () => true,
}));

vi.mock("../services/database", () => ({
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}));

vi.mock("../services/mcpBridge", () => ({
  startMcpBridge: mocks.startMcpBridge,
  startMcpServer: mocks.startMcpServer,
  stopMcpServer: mocks.stopMcpServer,
}));

const { useMcpStore } = await import("./mcpStore");

describe("MCP store lifecycle", () => {
  beforeEach(() => {
    mocks.getSetting.mockClear();
    mocks.setSetting.mockClear();
    mocks.startMcpBridge.mockClear();
    mocks.startMcpServer.mockClear();
    mocks.stopMcpServer.mockClear();
    useMcpStore.setState({
      enabled: true,
      port: 47_831,
      status: "stopped",
      url: null,
      token: null,
      error: null,
      initialized: false,
    });
  });

  it("keeps one server alive across StrictMode-style effect replay", async () => {
    const firstInitialization = useMcpStore.getState().initialize();
    const firstCleanup = useMcpStore.getState().shutdown();
    const secondInitialization = useMcpStore.getState().initialize();

    await Promise.all([firstInitialization, firstCleanup, secondInitialization]);

    expect(mocks.startMcpBridge).toHaveBeenCalledTimes(1);
    expect(mocks.startMcpServer).toHaveBeenCalledTimes(1);
    expect(mocks.stopMcpServer).not.toHaveBeenCalled();
    expect(useMcpStore.getState().initialized).toBe(true);

    await useMcpStore.getState().shutdown();

    expect(mocks.stopMcpServer).toHaveBeenCalledTimes(1);
    expect(useMcpStore.getState().initialized).toBe(false);
  });

  it("stops a server that finishes starting after disable was requested", async () => {
    let releaseStart!: (response: {
      running: boolean;
      port: number;
      url: string;
      token: string;
      error: null;
    }) => void;
    const start = new Promise<{
      running: boolean;
      port: number;
      url: string;
      token: string;
      error: null;
    }>((resolve) => {
      releaseStart = resolve;
    });
    mocks.startMcpServer.mockReturnValueOnce(start);

    const initialize = useMcpStore.getState().initialize();
    await vi.waitFor(() => expect(mocks.startMcpServer).toHaveBeenCalledTimes(1));
    const disable = useMcpStore.getState().setEnabled(false);

    releaseStart({
      running: true,
      port: 47_831,
      url: "http://127.0.0.1:47831/mcp",
      token: "mcp-started-before-disable",
      error: null,
    });
    await Promise.all([initialize, disable]);

    expect(mocks.stopMcpServer).toHaveBeenCalledTimes(1);
    expect(useMcpStore.getState()).toMatchObject({
      enabled: false,
      initialized: false,
      status: "stopped",
      url: null,
      token: null,
    });

    await useMcpStore.getState().shutdown();
  });

  it("retains the bridge and completes startup after the first server start fails", async () => {
    const firstUnlisten = vi.fn();
    mocks.startMcpBridge.mockResolvedValueOnce(firstUnlisten);
    mocks.startMcpServer
      .mockRejectedValueOnce(new Error("port is busy"))
      .mockResolvedValueOnce({
        running: true,
        port: 47_832,
        url: "http://127.0.0.1:47832/mcp",
        token: "mcp-recovered-token",
        error: null,
      });

    await useMcpStore.getState().initialize();
    expect(useMcpStore.getState().status).toBe("error");
    expect(useMcpStore.getState().initialized).toBe(false);

    await useMcpStore.getState().setPort(47_832);

    expect(mocks.startMcpBridge).toHaveBeenCalledTimes(1);
    expect(mocks.startMcpServer).toHaveBeenNthCalledWith(2, 47_832);
    expect(useMcpStore.getState()).toMatchObject({
      initialized: true,
      status: "running",
      port: 47_832,
      url: "http://127.0.0.1:47832/mcp",
      token: "mcp-recovered-token",
    });

    await useMcpStore.getState().shutdown();
    expect(mocks.stopMcpServer).toHaveBeenCalledTimes(1);
    expect(firstUnlisten).toHaveBeenCalledTimes(1);
  });
});
