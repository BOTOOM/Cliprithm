import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};
const distributionChannel = process.env.CLIPRITHM_DISTRIBUTION_CHANNEL ?? "github";
const distribution = {
  channel: distributionChannel,
  updateStrategy:
    process.env.CLIPRITHM_UPDATE_STRATEGY ??
    (distributionChannel === "github" ? "self-update" : "store-managed"),
  packageName: process.env.CLIPRITHM_PACKAGE_NAME ?? "cliprithm",
  storeName: process.env.CLIPRITHM_STORE_NAME ?? null,
  storeUrl: process.env.CLIPRITHM_STORE_URL ?? null,
  storeInstructions: process.env.CLIPRITHM_STORE_INSTRUCTIONS ?? null,
  versionSourceType: process.env.CLIPRITHM_VERSION_SOURCE_TYPE ?? null,
  versionSourceUrl: process.env.CLIPRITHM_VERSION_SOURCE_URL ?? null,
};

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __CLIPRITHM_DISTRIBUTION__: JSON.stringify(distribution),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
