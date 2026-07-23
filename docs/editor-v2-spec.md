# Cliprithm Editor v2 Specification

**Status:** Draft for implementation
**Owner:** Cliprithm core
**Last updated:** 2026-07-21

## Purpose

Cliprithm v2 evolves the product from a single-video silence remover into a non-destructive video editor. The editor keeps user media untouched, represents edits as project data, and renders derived previews and exports from that data.

Stable action identifiers and typed project data are intentional: a future MCP server must be able to invoke the same operations as the UI without coupling to React components.

## Product decisions

- Importing media opens the editor without automatically detecting silence.
- v1 exposes one sequential primary video track. The model reserves track types for audio, overlays, images, GIFs, and text.
- v1 supports video assets only in the user-facing media workflow.
- v1 supports split, trim, move, duplicate, delete, and per-clip speed.
- Clip speed range is `0.25x` to `32x` and audio pitch is preserved during render.
- Adjacent clips use a direct cut by default. No black gap or implicit transition is inserted.
- Silence detection is an explicit action with `selected clip` and `whole timeline` scopes.
- Detection produces a candidate. Accepting the candidate is the only operation that mutates the timeline.
- Derived previews and analysis jobs are internal implementation artifacts, not user projects.
- Official distributables include FFmpeg and FFprobe. End users must not install Rust, Node, pnpm, or FFmpeg.

## Experience model

The editor keeps the current Obsidian Loom visual identity: charcoal surfaces, purple primary accents, tonal layering, subtle borders, compact controls, and Inter typography. CapCut is an interaction reference only: actions should be discoverable, grouped, and friendly to creators without turning the visual language into a copy.

The main workspace contains:

1. project header and global actions;
2. media panel;
3. preview monitor and transport;
4. contextual inspector;
5. primary video timeline with ruler, playhead, selection, and clip controls.

Silence review is a contextual panel or sheet within the editor, not a mandatory application view.

## Domain model

```text
Project
 ├── MediaAsset[]
 ├── TimelineTrack[]
 │    └── TimelineClip[]
 ├── ProjectSettings
 └── revision
```

### MediaAsset

A source file or future generated resource.

Required fields:

- `id`: stable project-local identifier;
- `kind`: `video` in v1; future values include `image`, `gif`, `audio`, `text`;
- `path`: original local path or browser URL;
- `name`;
- `metadata`: duration, dimensions, FPS, codec, file size, audio presence;
- `thumbnailPath`;
- `sourceFingerprint`: file size, modification time, and a content fingerprint when available.

### TimelineTrack

A logical layer. v1 exposes one `video` track with sequential clips.

Required fields:

- `id`;
- `kind`: `video`, `audio`, `overlay`;
- `name`;
- `clipIds` in timeline order;
- `muted`, `locked`, and `visible` state.

### TimelineClip

A non-destructive reference to a source interval.

Required fields:

- `id`;
- `assetId`;
- `trackId`;
- `sourceStart`;
- `sourceEnd`;
- `speed`;
- `label`;
- optional `createdByActionId`.

Derived values:

- `sourceDuration = sourceEnd - sourceStart`;
- `timelineDuration = sourceDuration / speed`;
- `timelineStart` and `timelineEnd` from ordered track layout.

The source file is never rewritten by edit actions.

## Action architecture

The UI, keyboard shortcuts, future MCP, and automated flows use the action registry described in `editor-actions.md`. Every action definition includes:

- stable `id`;
- category;
- input schema;
- preconditions;
- mutation behavior;
- undo behavior;
- progress class;
- user-visible label keys;
- MCP exposure policy.

React components dispatch actions. They must not duplicate timeline mutation rules.

## Silence detection

### Scope

- `clip`: analyze the selected clip's source interval and current speed mapping.
- `timeline`: analyze all primary-track video clips that have audio, in timeline order.

Images, GIFs, text, and clips without audio are excluded from v1 analysis. The result is represented in timeline coordinates and mapped back to source coordinates when applied.

### Candidate lifecycle

```text
idle -> preparing -> analyzing -> reviewable -> accepted
                                      \-> discarded
```

A candidate stores the project revision, detection settings, scope, source clips, and proposed ranges. If the project changes while analysis is running, the candidate is stale and cannot be accepted without re-running.

### Warning policy

Show a non-blocking warning before full-timeline detection when the analyzed duration is at least two minutes or the source set is large. The user may continue or cancel.

## Derived jobs and preview

Derived jobs are internal and are stored under the app data directory. They are never listed as projects.

Supported job types:

- `asset_proxy`;
- `sequence_preview`;
- `preview_window`;
- `silence_analysis`;
- `export_render`.

A job includes `jobId`, `projectRevision`, `cacheKey`, `priority`, `status`, `progress`, and output path.

### Preview strategy

- The source preview is used when no composition is required.
- A low-resolution H.264/AAC proxy is used for codec normalization and sequence playback.
- Short projects render a full sequence proxy after a short debounce.
- Long projects render a continuous window around the playhead first, then complete the full sequence when idle or requested.
- Only one preview FFmpeg process runs at a time.
- A newer revision cancels or invalidates older work.
- Preview uses bounded threads and editing resolution; export always uses original sources and requested output settings.
- The UI remains interactive while a job runs and reports whether the preview is current or stale.

## Rendering and export

The renderer accepts a project composition rather than a single input plus ranges. It must:

- open multiple source inputs;
- trim each source interval;
- apply per-clip video speed with `setpts`;
- apply per-clip audio speed with chained `atempo` while preserving pitch;
- normalize pixel format, frame rate, sample rate, and channel layout;
- synthesize silence for video clips without audio;
- concatenate adjacent clips without black frames;
- apply output resize and FPS settings only after composition;
- expose progress and cancellation.

## Persistence and compatibility

SQLite receives a migration for project timeline data and schema version. Existing projects are converted into one media asset and a primary track. Legacy fields remain readable during the migration window but are not the source of truth for new projects.

Autosave stores project data after debounced mutations. Derived outputs are cacheable and disposable; they are not required to restore edit intent.

## Distribution requirements

Official AppImage, deb, rpm, Snap, Flatpak, Windows, and macOS artifacts must contain working FFmpeg and FFprobe for their target architecture. Build CI must verify both binaries from the packaged artifact. Runtime lookup may fall back to system binaries only in development or explicitly unsupported custom builds.

The application must not instruct users of official builds to install FFmpeg manually. Missing internal binaries are an installation integrity error with a reinstall/update action.

## Performance budgets

- React interactions must not wait for FFmpeg.
- At most one preview job is active per project.
- Stale preview jobs are cancelled or ignored by revision.
- Preview output is capped at editing resolution, not export resolution.
- Timeline drag updates use transient interaction state and commit one action at the end when possible.
- Cache keys include project revision and source fingerprints.
- Generated previews must be evictable without affecting project recovery.

## Accessibility

- Every icon-only action has an accessible name.
- All drag operations have keyboard alternatives.
- Focus remains visible.
- Sliders expose labels, values, min/max, and step.
- Detection, render, and export states provide text feedback in addition to color.
- Reduced-motion preferences disable decorative motion.

## Out of scope for v1

- video-over-video compositing;
- image, GIF, audio, and text UI tools;
- transitions and video effects;
- captions redesign;
- cloud projects or collaboration;
- MCP server implementation itself.

The data model and action registry must still reserve extension points for these capabilities.
