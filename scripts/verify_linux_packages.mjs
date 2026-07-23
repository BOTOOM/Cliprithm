#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const [targetTriple, bundleDirectory] = process.argv.slice(2).filter((arg) => arg !== "--");

if (!targetTriple || !bundleDirectory) {
  console.error("Usage: verify_linux_packages.mjs <target-triple> <bundle-directory>");
  process.exit(1);
}

const executableNames = new Set([
  `ffmpeg-${targetTriple}`,
  `ffprobe-${targetTriple}`,
  "ffmpeg",
  "ffprobe",
]);

async function findExecutables(directory) {
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
      matches.push(...(await findExecutables(entryPath)));
    } else if (executableNames.has(entry.name)) {
      matches.push(entryPath);
    }
  }
  return matches;
}

async function runVersion(binaryPath) {
  await execFileAsync(binaryPath, ["-version"], { windowsHide: true });
}

async function verifyTree(directory, label) {
  const binaries = await findExecutables(directory);
  const ffmpeg = binaries.find((file) => path.basename(file).startsWith("ffmpeg"));
  const ffprobe = binaries.find((file) => path.basename(file).startsWith("ffprobe"));
  if (!ffmpeg || !ffprobe) {
    throw new Error(`${label} does not contain both FFmpeg and FFprobe sidecars`);
  }
  await runVersion(ffmpeg);
  await runVersion(ffprobe);
  console.log(`Verified ${label}: ${ffmpeg}, ${ffprobe}`);
}

async function extractDeb(packagePath, destination) {
  await execFileAsync("dpkg-deb", ["-x", packagePath, destination]);
}

async function extractRpm(packagePath, destination) {
  await new Promise((resolve, reject) => {
    const rpm = spawn("rpm2cpio", [packagePath], { stdio: ["ignore", "pipe", "pipe"] });
    const cpio = spawn("cpio", ["-idm", "--quiet"], {
      cwd: destination,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let rpmStderr = "";
    let cpioStderr = "";
    let rpmExitCode;
    let cpioExitCode;
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        rpm.kill();
        cpio.kill();
        reject(error);
      }
    };
    const finish = () => {
      if (settled || rpmExitCode === undefined || cpioExitCode === undefined) return;
      if (rpmExitCode !== 0) {
        fail(new Error(`rpm2cpio failed with code ${rpmExitCode}: ${rpmStderr}`));
      } else if (cpioExitCode !== 0) {
        fail(new Error(`cpio failed with code ${cpioExitCode}: ${cpioStderr}`));
      } else {
        settled = true;
        resolve();
      }
    };
    rpm.stderr.on("data", (chunk) => {
      rpmStderr += chunk;
    });
    cpio.stderr.on("data", (chunk) => {
      cpioStderr += chunk;
    });
    rpm.once("error", (error) => fail(error));
    cpio.once("error", (error) => fail(error));
    rpm.once("exit", (code) => {
      rpmExitCode = code;
      finish();
    });
    cpio.once("exit", (code) => {
      cpioExitCode = code;
      finish();
    });
    rpm.stdout.pipe(cpio.stdin);
  });
}

try {
  const entries = await fs.readdir(bundleDirectory, { withFileTypes: true });
  const packages = entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".deb") || entry.name.endsWith(".rpm")))
    .map((entry) => path.join(bundleDirectory, entry.name));
  if (packages.length === 0) {
    throw new Error(`No .deb or .rpm packages found under ${bundleDirectory}`);
  }

  for (const packagePath of packages) {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cliprithm-package-"));
    try {
      if (packagePath.endsWith(".deb")) {
        await extractDeb(packagePath, temporaryDirectory);
      } else {
        await extractRpm(packagePath, temporaryDirectory);
      }
      await verifyTree(temporaryDirectory, path.basename(packagePath));
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(`[package-sidecar-check] ${error.message}`);
  process.exit(1);
}
