#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const binariesDir = path.join(repoRoot, "src-tauri", "binaries");

function currentTargetTriple() {
  return execSync("rustc --print host-tuple", {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

async function ensureExecutable(targetPath) {
  if (process.platform !== "win32") {
    await fs.chmod(targetPath, 0o755);
  }
}

async function copyBinary(sourcePath, name, targetTriple) {
  const extension = path.extname(sourcePath);
  const destination = path.join(
    binariesDir,
    `${name}-${targetTriple}${extension}`
  );
  await fs.copyFile(sourcePath, destination);
  await ensureExecutable(destination);
  console.log(`[ffmpeg-sidecar] Prepared ${path.relative(repoRoot, destination)}`);
}

async function main() {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    console.log(
      "[ffmpeg-sidecar] Skipping sidecar preparation on this platform; Linux uses runtime detection."
    );
    return;
  }

  const ffprobePath = ffprobe.path;
  if (!ffmpegPath || !ffprobePath) {
    throw new Error("ffmpeg-static or ffprobe-static did not expose a binary path");
  }

  const targetTriple = currentTargetTriple();
  await fs.mkdir(binariesDir, { recursive: true });
  await copyBinary(ffmpegPath, "ffmpeg", targetTriple);
  await copyBinary(ffprobePath, "ffprobe", targetTriple);
}

main().catch((error) => {
  console.error("[ffmpeg-sidecar] Failed:", error);
  process.exit(1);
});
