# SilenCut — The Precision Darkroom

A desktop application for automatic silence detection and removal in videos. Built with Tauri, React, TypeScript, and FFmpeg.

## Features

- **Smart Cut**: Automatically detects and removes silent segments from video
- **Time Warp**: Speed up silent segments instead of cutting them (configurable 1.5x - 6x)
- **Captions Beta**: Generate transcriptions with multiple providers:
  - **Cloud**: OpenRouter, Cerebras, Groq (free tier)
  - **Local**: Ollama, LM Studio (low-resource models)
  - Output: SRT + WebVTT, optional burn-in
- **Export Presets**: TikTok/Shorts, Instagram Reels, Custom (1080p/4K, 30/60fps)
- **Timeline**: Visual waveform with silence zones highlighted
- **Preview**: Play original and processed video side by side

## Tech Stack

- **Desktop Framework**: [Tauri v2](https://tauri.app/)
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS v4 (Obsidian Loom design system)
- **State**: Zustand
- **Backend**: Rust
- **Video Processing**: FFmpeg

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://rustup.rs/) (stable)
- [FFmpeg](https://ffmpeg.org/) installed and in PATH
- System dependencies for Tauri:
  - **Arch/Manjaro**: `webkit2gtk-4.1 gtk3 librsvg`
  - **Ubuntu/Debian**: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev`

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
silencut/
├── desing/                    # UI/UX designs (Stitch exports)
├── src/                       # React frontend
│   ├── components/
│   │   ├── layout/            # TopNavBar, SideNavBar, MainLayout
│   │   ├── import/            # EmptyState with drag & drop
│   │   ├── processing/        # ProcessingView with circular progress
│   │   ├── editor/            # EditorView, SettingsPanel
│   │   ├── timeline/          # Timeline with waveform visualization
│   │   ├── export/            # ExportModal with presets
│   │   └── ui/                # Button, Slider, Toggle, Icon
│   ├── stores/                # Zustand stores
│   ├── services/              # Tauri command wrappers
│   ├── types/                 # TypeScript types
│   └── lib/                   # Utilities
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── commands/
│   │   │   └── ffmpeg.rs      # All FFmpeg operations
│   │   ├── lib.rs             # Tauri app builder
│   │   └── main.rs            # Entry point
│   └── Cargo.toml
└── package.json
```

## Usage

1. **Import**: Drag & drop or browse for a video file (MP4, MOV, MKV)
2. **Detect**: Silence is automatically detected using FFmpeg's `silencedetect` filter
3. **Adjust**: Configure threshold (dB), minimum duration, and mode (Cut vs Time Warp)
4. **Preview**: Watch the result with silence removed/sped up
5. **Export**: Choose preset, resolution, frame rate, and export

## Design System

Based on "The Obsidian Loom" — a dark, editorial design system with:
- Deep charcoal surfaces (#0e0e0e → #262626)
- Purple primary accents (#ba9eff)
- Glassmorphism effects
- No-line rule (surfaces separated by color, not borders)
- Inter typeface throughout

## License

MIT
