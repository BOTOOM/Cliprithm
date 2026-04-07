#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageJsonPath = path.join(repoRoot, "package.json");
const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");

function syncCargoVersion(version) {
  const current = fs.readFileSync(cargoTomlPath, "utf8");
  const next = current.replace(/^version = "[^"]+"/m, `version = "${version}"`);

  if (next !== current) {
    fs.writeFileSync(cargoTomlPath, next);
    return true;
  }

  return false;
}

function syncTauriConfigVersion(version) {
  const current = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));

  if (current.version === version) {
    return false;
  }

  current.version = version;
  fs.writeFileSync(tauriConfigPath, `${JSON.stringify(current, null, 2)}\n`);
  return true;
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const args = process.argv.slice(2);

const cargoSynced = syncCargoVersion(version);
const tauriConfigSynced = syncTauriConfigVersion(version);
const versionSynced = cargoSynced || tauriConfigSynced;

if (versionSynced) {
  console.log(`[tauri] Synced src-tauri version files to ${version}`);
}

const env = { ...process.env };
const command = args[0];
const tauriArgs = [...args];

if (
  process.platform === "linux" &&
  (command === "build" || command === "bundle") &&
  !env.APPIMAGE_EXTRACT_AND_RUN
) {
  env.APPIMAGE_EXTRACT_AND_RUN = "1";
  console.log("[tauri] Enabled APPIMAGE_EXTRACT_AND_RUN=1 for local Linux bundling");
}

if (process.platform === "linux" && (command === "build" || command === "bundle") && !env.NO_STRIP) {
  env.NO_STRIP = "1";
  console.log("[tauri] Enabled NO_STRIP=1 to avoid linuxdeploy strip failures");
}

if (
  (command === "build" || command === "bundle") &&
  !env.TAURI_SIGNING_PRIVATE_KEY &&
  !env.TAURI_SIGNING_PRIVATE_KEY_PATH
) {
  tauriArgs.push(
    "--config",
    JSON.stringify({
      bundle: {
        createUpdaterArtifacts: false,
      },
    })
  );
  console.log("[tauri] Disabled updater artifacts for this local unsigned build");
}

const tauriBin =
  process.platform === "win32"
    ? path.join(repoRoot, "node_modules", ".bin", "tauri.cmd")
    : path.join(repoRoot, "node_modules", ".bin", "tauri");

const child = spawn(tauriBin, tauriArgs, {
  cwd: repoRoot,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[tauri] Failed to start Tauri CLI:", error);
  process.exit(1);
});
