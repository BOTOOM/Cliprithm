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

function executableExtension(targetTriple) {
  return targetTriple.includes("windows") ? ".exe" : "";
}

async function ensureExecutable(targetPath) {
  if (process.platform !== "win32") {
    await fs.chmod(targetPath, 0o755);
  }
}

async function copyBinary(sourcePath, name, targetTriple) {
  const extension = executableExtension(targetTriple) || path.extname(sourcePath);
  const destination = path.join(
    binariesDir,
    `${name}-${targetTriple}${extension}`
  );
  await fs.copyFile(sourcePath, destination);
  await ensureExecutable(destination);
  console.log(`[ffmpeg-sidecar] Prepared ${path.relative(repoRoot, destination)}`);
}

async function hasExistingSidecars(targetTriple) {
  const extension = executableExtension(targetTriple);
  const ffmpegDestination = path.join(
    binariesDir,
    `ffmpeg-${targetTriple}${extension}`
  );
  const ffprobeDestination = path.join(
    binariesDir,
    `ffprobe-${targetTriple}${extension}`
  );

  try {
    await Promise.all([
      fs.access(ffmpegDestination),
      fs.access(ffprobeDestination),
    ]);
    console.log(
      `[ffmpeg-sidecar] Reusing existing ${targetTriple} FFmpeg sidecars`
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const targetTriple = currentTargetTriple();
  if (await hasExistingSidecars(targetTriple)) {
    return;
  }

  const ffprobePath = ffprobe.path;
  if (!ffmpegPath || !ffprobePath) {
    throw new Error("ffmpeg-static or ffprobe-static did not expose a binary path");
  }

  await fs.mkdir(binariesDir, { recursive: true });
  await copyBinary(ffmpegPath, "ffmpeg", targetTriple);
  await copyBinary(ffprobePath, "ffprobe", targetTriple);
}

main().catch((error) => {
  console.error("[ffmpeg-sidecar] Failed:", error);
  process.exit(1);
});
