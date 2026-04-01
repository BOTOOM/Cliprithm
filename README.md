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
