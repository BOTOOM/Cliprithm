#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawArguments = process.argv.slice(2).filter((argument) => argument !== "--");
const requireBundle = rawArguments.includes("--require-bundle");
const scriptArguments = rawArguments.filter((argument) => argument !== "--require-bundle");
const targetTriple = scriptArguments[0];

if (!targetTriple) {
  console.error("Usage: verify_bundled_sidecars.mjs <target-triple> [bundle-directory]");
  process.exit(1);
}

const executableExtension = targetTriple.includes("windows") ? ".exe" : "";
const sidecarNames = [
  `ffmpeg-${targetTriple}${executableExtension}`,
  `ffprobe-${targetTriple}${executableExtension}`,
];
const packagedBinaryNames = new Set([
  ...sidecarNames,
  `ffmpeg${executableExtension}`,
  `ffprobe${executableExtension}`,
]);
const sourceDirectory = path.join(repoRoot, "src-tauri", "binaries");
const bundleDirectory = scriptArguments[1]
  ? path.resolve(scriptArguments[1])
  : path.join(repoRoot, "src-tauri", "target", targetTriple, "release", "bundle");

async function assertExecutable(filePath, label) {
  try {
    await fs.access(filePath, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
  } catch {
    throw new Error(`${label} is missing or not executable: ${filePath}`);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(filePath, ["-version"], { stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function findFiles(directory, names) {
  const matches = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return matches;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(entryPath, names)));
    } else if (names.has(entry.name)) {
      matches.push(entryPath);
    }
  }
  return matches;
}

try {
  for (const name of sidecarNames) {
    await assertExecutable(path.join(sourceDirectory, name), name);
  }

  const bundleMatches = await findFiles(bundleDirectory, packagedBinaryNames);
  if (bundleMatches.length > 0) {
    for (const match of bundleMatches) {
      await assertExecutable(match, path.basename(match));
    }
    console.log(`Verified ${bundleMatches.length} packaged FFmpeg sidecars.`);
  } else if (requireBundle) {
    throw new Error(`No packaged sidecars found under ${bundleDirectory}`);
  } else {
    console.warn(`No unpacked sidecars found under ${bundleDirectory}; source sidecars were verified.`);
  }
} catch (error) {
  console.error(`[sidecar-check] ${error.message}`);
  process.exit(1);
}
