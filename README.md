# Cliprithm — Smart Video Silence Remover

A desktop application for automatic silence detection and removal in videos. Built with Tauri, React, TypeScript, Rust, and FFmpeg.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/BOTOOM?style=flat&logo=github)](https://github.com/sponsors/BOTOOM)

## Features

- **Smart Cut**: Automatically detects and removes silent segments from video
- **Time Warp**: Speed up silent segments instead of cutting them
- **Playback Speed**: Global 0.5x – 4x speed with manual input
- **Clip Editor**: Trim, split, delete, and rearrange clips on a visual timeline
- **Project Persistence**: Auto-save progress, resume editing anytime
- **Undo**: Ctrl+Z to revert edits
- **Export Presets**: TikTok/Shorts, Instagram Reels, Custom (1080p/4K, 30/60fps)
- **Captions Beta**: Generate transcriptions (OpenRouter, Cerebras, Groq, Ollama, LM Studio)
- **i18n**: English and Spanish
- **Auto Updates**: Automatic update checking via GitHub Releases
- **Cross Platform**: Linux, Windows, macOS

## Tech Stack

- **Desktop Framework**: [Tauri v2](https://tauri.app/)
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS v4
- **State**: Zustand
- **Backend**: Rust
- **Database**: SQLite (via tauri-plugin-sql)
- **Video Processing**: FFmpeg

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Rust](https://rustup.rs/) (stable)
- [FFmpeg](https://ffmpeg.org/) installed and in PATH
- System dependencies for Tauri:
  - **Ubuntu/Debian**: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev patchelf`
  - **Arch/Manjaro**: `webkit2gtk-4.1 gtk3 librsvg`

## Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build

# Remove generated build/debug artifacts
npm run clean
```

On local Linux builds, `npm run tauri build` now auto-enables the AppImage fallback used by `linuxdeploy`, skips the problematic `strip` pass, and disables updater artifacts when no signing key is configured. That makes unsigned local builds work more reliably on distros like Arch/Manjaro.

## Installing from Releases

### Linux

- **Arch / Manjaro**: install from AUR:

```bash
yay -S cliprithm
```

- **Ubuntu / Debian**: install the `.deb` artifact from the GitHub release:

```bash
sudo apt install ./Cliprithm_<version>_amd64.deb
```

- **Generic Linux**: use the AppImage as the portable fallback:

```bash
chmod +x Cliprithm_<version>_amd64.AppImage
./Cliprithm_<version>_amd64.AppImage
```

If the AppImage freezes or behaves oddly on some Arch/Manjaro systems, try:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./Cliprithm_<version>_amd64.AppImage
```

That workaround helps on systems where AppImage/FUSE integration is inconsistent. For Arch-based distros, the AUR package is the preferred destination.

### Windows

- Use `Cliprithm_1.0.0_x64-setup.exe` for the guided installer
- Use `Cliprithm_1.0.0_x64_en-US.msi` for MSI-based deployment

## AUR Publishing Automation

Cliprithm is prepared to publish a **source-based** AUR package named `cliprithm` from the main repository release workflow.

The automation:
- generates `PKGBUILD` and `.SRCINFO` from the release version and tag
- points the package to the tagged GitHub source tarball
- computes the release tarball `sha256`
- pushes the updated package files to the AUR git repository

Required GitHub configuration:
- Secret: `AUR_SSH_PRIVATE_KEY`
- Optional repository variable: `AUR_PACKAGE_REPO_SSH_URL`

Default AUR repository URL if the variable is not set:

```text
ssh://aur@aur.archlinux.org/cliprithm.git
```

Recommended maintainer setup:
1. Create or use your AUR account
2. Generate a dedicated SSH keypair for AUR publishing
3. Add the public key to your AUR account
4. Save the private key in this repo as `AUR_SSH_PRIVATE_KEY`
5. Let the release workflow publish the package on future releases

## Cleanup

When the project starts consuming too much disk space again, use:

```bash
npm run clean
```

That removes `dist`, `src-tauri/gen`, and `src-tauri/target`.

If you also want to remove `node_modules`:

```bash
npm run clean:full
```

## Project Structure

```
cliprithm/
├── src/                       # React frontend
│   ├── components/
│   │   ├── layout/            # TopNavBar, SideNavBar, MainLayout
│   │   ├── import/            # EmptyState, MediaLibrary
│   │   ├── processing/        # ProcessingView
│   │   ├── editor/            # EditorView, SettingsPanel
│   │   ├── timeline/          # Timeline with clip visualization
│   │   ├── export/            # ExportModal with presets
│   │   ├── about/             # About & Sponsor page
│   │   └── ui/                # Button, Slider, Toggle, SpeedControl, Icon
│   ├── stores/                # Zustand stores
│   ├── services/              # DB, Tauri command wrappers
│   ├── hooks/                 # Auto-save, custom hooks
│   └── lib/                   # i18n, logger, utilities
├── src-tauri/                 # Rust backend
│   ├── src/commands/          # FFmpeg, library, media server
│   └── tauri.conf.json
├── .github/                   # CI/CD, issue templates
└── public/                    # Logo, static assets
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) — Made with 💜 by [Edwar Diaz](https://edwardiaz.dev)
