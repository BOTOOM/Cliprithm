---
name: testing-cliprithm-desktop
description: How to build, run, and end-to-end test the Cliprithm Tauri v2 desktop app (project list, import, silence detection, editor). Use when testing any feature that requires the real desktop runtime rather than browser-only `pnpm dev`.
---

# Testing the Cliprithm desktop app

Cliprithm is a React 19 + TypeScript frontend with a Rust/Tauri v2 backend. Features like
the project list (MediaLibrary), silence detection, and editor require the **real desktop
runtime** (`pnpm tauri dev`). Browser-only `pnpm dev` shows "desktop only" placeholders.

## Environment setup (three common blockers)
Running `pnpm tauri dev` from a clean box often fails in three ways; fix in this order:

1. **Sidecar script `rustc --print host-tuple` unsupported.**
   `scripts/prepare_ffmpeg_sidecars.mjs` runs on `dev`/`build` and calls
   `rustc --print host-tuple`, which older/newer rustc may not support. Workaround WITHOUT
   editing code: pre-create the sidecars so `hasExistingSidecars()` short-circuits. If you
   must, temporarily patch `currentTargetTriple()` to fall back to parsing `rustc -vV`
   (grep the `host:` line) → produces e.g. `x86_64-unknown-linux-gnu`, then run
   `node scripts/prepare_ffmpeg_sidecars.mjs`. This copies ffmpeg-static/ffprobe-static into
   `src-tauri/binaries/`. Revert any script edit afterward (`git checkout`).

2. **Cargo too old for `edition2024`.** Dependency `dlopen2 v0.8.2` needs edition2024
   (cargo ≥ 1.85). If you see "feature `edition2024` is required", run `rustup update stable`.

3. **Missing Linux system libs / pkg-config.** Tauri needs GTK/WebKit dev libs:
   `sudo apt-get install -y pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev
   librsvg2-dev libjavascriptcoregtk-4.1-dev libayatana-appindicator3-dev`

The first Rust compile takes several minutes. App is ready when `curl http://localhost:1420`
returns 200 and a maximizable "Cliprithm" window appears. Maximize with
`wmctrl -r Cliprithm -b add,maximized_vert,maximized_horz`.

## Importing videos
- The import screen "Browse Files" button opens the **native GTK file dialog**. Use
  `Ctrl+L` then type an absolute path (e.g. `/tmp/testvids/foo.mp4`) then Enter.
- Generate test videos with system ffmpeg, e.g.:
  `ffmpeg -f lavfi -i color=c=red:s=640x360:d=4 -f lavfi -i sine=frequency=440:duration=4
   -vf "drawtext=text='A':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2"
   -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest a.mp4`

## Identifying which project is open
- Editor header shows `EDITOR <name>` and the CLIP INSPECTOR shows the asset name + duration.
- Recent Projects list thumbnails are generated per-video (distinct colors help).
- **Video preview playback often fails ("Preview could not start") in headless dev** —
  a media-server/codec limitation, not a product bug. Identify projects by header name /
  duration / thumbnail color, not by the preview canvas.

## Inspecting persisted state
- SQLite DB: `~/.config/com.botom.cliprithm/cliprithm.db` (install `sqlite3`).
  `select id,name,current_view,status from projects;`
- Autosave (`src/hooks/useAutoSave.ts`) persists `current_view` on change (1.5s debounce)
  for the active `projectId`. Reopening a project restores its saved `current_view`
  (`MediaLibrary.handleOpenProject`), so navigation that changes `currentView` while a
  project is active can affect how it reopens — worth checking when testing navigation.

## Devin Secrets Needed
None.
