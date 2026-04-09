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
- **Store-Aware Updates**: GitHub installs self-update, while AUR/Snap/Flatpak/Homebrew channels can switch to store-managed guidance
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

# Validate the Linux release bundle locally before publishing
npm run verify:linux-release

# Validate both AUR package variants locally
npm run verify:aur:source
npm run verify:aur:bin
```

On local Linux builds, `npm run tauri build` now auto-enables the AppImage fallback used by `linuxdeploy`, skips the problematic `strip` pass, and disables updater artifacts when no signing key is configured. That makes unsigned local builds work more reliably on distros like Arch/Manjaro.

## Installing from Releases

Files ending in `.sig` and `latest.json` are **not installers**:

- `.sig` files are release/update signatures
- `latest.json` is used by the in-app updater for GitHub-distributed builds

### Linux

| Target system | Release file | What to do |
| --- | --- | --- |
| Arch / Manjaro | AUR `cliprithm` | `yay -S cliprithm` |
| Arch / Manjaro | AUR `cliprithm-bin` | `yay -S cliprithm-bin` |
| Ubuntu / Debian | `Cliprithm_<version>_amd64.deb` | `sudo apt install ./Cliprithm_<version>_amd64.deb` |
| Fedora / RHEL | `Cliprithm-<version>-1.x86_64.rpm` | `sudo dnf install ./Cliprithm-<version>-1.x86_64.rpm` |
| openSUSE | `Cliprithm-<version>-1.x86_64.rpm` | `sudo zypper install ./Cliprithm-<version>-1.x86_64.rpm` |
| Generic Linux | `Cliprithm_<version>_amd64.AppImage` | portable fallback; see below |

For the AppImage:

```bash
chmod +x Cliprithm_<version>_amd64.AppImage
./Cliprithm_<version>_amd64.AppImage
```

On Arch / Manjaro, if direct AppImage mounting fails, install the compatibility package once:

```bash
sudo pacman -S fuse2
```

If the AppImage opens with a blank or white window on Arch / Manjaro, run it in **one single line**:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 LIBGL_ALWAYS_SOFTWARE=1 ./Cliprithm_<version>_amd64.AppImage
```

For Arch-based distros, `cliprithm-bin` is the preferred package because it already wraps the AppImage in the recommended AUR launcher.

### Windows

- Use `Cliprithm_<version>_x64-setup.exe` for the normal interactive installer
- Use `Cliprithm_<version>_x64_en-US.msi` for managed or silent MSI deployment

### macOS

- Download the `.dmg` that matches your Mac CPU:
  - Apple Silicon: `aarch64`
  - Intel: `x64`
- Open the `.dmg`, drag **Cliprithm.app** into **Applications**, and start it from there

If a specific release tag does not include macOS assets, that tag was published without the macOS build job.

## AUR Publishing Automation

Cliprithm now has tooling for two AUR variants:

- `cliprithm` → source-based package
- `cliprithm-bin` → binary package backed by the release AppImage

GitHub Actions now publishes both AUR package variants when the SSH key is configured and the target AUR repositories exist.

The local/publication tooling:
- generates `PKGBUILD` and `.SRCINFO` from the release version and tag
- points the package either to the tagged GitHub source tarball or to the release AppImage
- computes the required `sha256` values automatically
- can be validated locally with `makepkg` before publishing

Required GitHub configuration:
- Secret: `AUR_SSH_PRIVATE_KEY`
- Optional repository variable: `AUR_PACKAGE_REPO_SSH_URL`

Default AUR repository URLs if the variable is not set:

```text
ssh://aur@aur.archlinux.org/cliprithm.git
ssh://aur@aur.archlinux.org/cliprithm-bin.git
```

The workflow derives `cliprithm-bin.git` automatically from `AUR_PACKAGE_REPO_SSH_URL`, so you do not need a second repository variable for the binary package.

Recommended maintainer setup:
1. Create or use your AUR account
2. Generate a dedicated SSH keypair for AUR publishing
3. Add the public key to your AUR account
4. Save the private key in this repo as `AUR_SSH_PRIVATE_KEY`
5. Make sure that same key has write access to both AUR repos
6. Let the release workflow publish both packages on future releases

Local validation flow:

```bash
# Build the Linux artifacts that users will receive
npm run verify:linux-release

# Validate source AUR metadata and sources
npm run verify:aur:source

# Validate binary AUR metadata against the locally built AppImage
npm run verify:aur:bin
```

See `distribution-playbooks/aur.md` for the full strategy and the notes for `cliprithm-bin`.

## Store Channels and Update Behavior

- **GitHub installers / AppImage from Releases** use the built-in Tauri updater.
- **AUR / AUR bin** are now prepared to run in **store-managed** mode, with the app pointing users back to AUR and checking the package version through the AUR RPC API.
- **Snap / Flatpak / Homebrew** now have repo scaffolding under `packaging/` plus playbooks in `distribution-playbooks/`, and the app can check public store metadata before guiding the user back to that channel.
- For store-managed channels, the app is designed to **avoid self-installing updates** and instead guide the user back to the store/package manager that delivered the app:
  - Snap -> Snap Store API
  - Flatpak -> Flathub appstream API
  - Homebrew -> Homebrew Cask JSON API or a raw tap cask file when you override the build env

Packaging scaffolding added in this repo:

- `packaging/flatpak/com.botom.cliprithm.yml`
- `packaging/snap/snapcraft.yaml`
- `packaging/homebrew/cliprithm.rb.template`
- `packaging/linux/` shared desktop/appstream metadata

## Cleanup

When the project starts consuming too much disk space again, use:

```bash
npm run clean
```

That removes `dist`, `src-tauri/gen`, `src-tauri/target`, and Snapcraft build artifacts under `packaging/snap/` (`.snapcraft`, `parts`, `prime`, `stage`, and generated `.snap` files).

If you also want to remove `node_modules`:

```bash
npm run clean:full
```

`npm run clean:full` also removes `node_modules` and `.playwright-mcp`.

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
├── packaging/                 # Flatpak, Snap, Homebrew, and shared Linux metadata
├── distribution-playbooks/    # Packaging and store deployment notes
├── .github/                   # CI/CD, issue templates
└── public/                    # Logo, static assets
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) — Made with 💜 by [Edwar Diaz](https://edwardiaz.dev)
