# Cliprithm Editor v2 Implementation Plan

**Status:** Approved for implementation
**Branch:** `feat/editor`
**Reference:** `docs/editor-v2-spec.md`

## Phase 0 — Documentation and contracts

- [x] Record product decisions and non-goals.
- [x] Define the project model and rendering boundaries.
- [x] Define stable editor action IDs.
- [x] Add the runtime action registry and compile-time-safe input types.
- [ ] Add a spec/catalog consistency check.

## Phase 1 — Domain model and migration

- [x] Add `MediaAsset`, `TimelineTrack`, `TimelineClip`, `TimelineProject`, project revisions, and detection candidates.
- [x] Add pure timeline utilities for duration, ordering, trim, split, move, duplicate, speed, and source/timeline mapping.
- [x] Add SQLite migration for timeline and asset JSON.
- [ ] Convert legacy single-video projects on load.
- [x] Update autosave and project restore for new timeline projects.
- [ ] Add unit tests for all pure operations.

Acceptance:

- Existing projects open without losing source ranges.
- New projects persist a full source clip without silence analysis.
- A project can be serialized and restored without changing derived durations.

## Phase 2 — Import and editor shell

- [x] Stop automatic silence detection after import.
- [x] Open imported media directly in the editor.
- [x] Add multiple video assets to the project.
- [x] Build the editor shell around the existing Obsidian Loom design tokens.
- [x] Add media panel, toolbar, monitor, inspector, and timeline regions.
- [x] Add English/Spanish strings for the new workflow.

Acceptance:

- Importing one or more videos never opens the old mandatory detection screen.
- A user can see all project media and add another video to the primary sequence.

## Phase 3 — Timeline editing and actions

- [ ] Implement the action registry and dispatcher.
- [x] Replace the old range timeline with project clips for new projects.
- [x] Add selection, split, trim, move, duplicate, delete, and speed.
- [x] Add keyboard shortcuts and accessible alternatives to drag operations.
- [x] Add redo and robust undo snapshots.
- [x] Add contextual clip inspector.

Acceptance:

- All listed edit actions are available through toolbar and keyboard where applicable.
- Every mutating action is undoable.
- Adjacent clips have no timeline gap unless a future track feature explicitly creates one.

## Phase 4 — Derived jobs and continuous preview

- [x] Add the project preview renderer and revision-based output naming.
- [ ] Add internal derived-job types and revision IDs.
- [ ] Add one-job-per-project scheduling with cancellation and stale-result protection.
- [ ] Add low-resolution asset proxy generation when needed.
- [ ] Add full sequence preview for short projects.
- [ ] Add playhead-centered window preview for long projects.
- [x] Add a bounded FFmpeg thread count for project preview.
- [x] Connect preview status to the monitor without blocking the timeline.

Acceptance:

- Playback across clip boundaries has no black frame caused by source seeking.
- Editing remains responsive while preview work runs.
- A newer edit cannot be overwritten by an older preview result.

## Phase 5 — Silence detection as a contextual operation

- [ ] Add detection scope selector for selected clip or whole timeline.
- [ ] Add long/large project warning.
- [ ] Run analysis against eligible clips with audio.
- [ ] Store candidate results separately from the project timeline.
- [ ] Add review, parameter adjustment, re-run, accept, and discard.
- [ ] Map accepted timeline ranges back to source clip ranges.
- [ ] Add undo for candidate acceptance.

Acceptance:

- Canceling detection leaves the project unchanged.
- Accepting a clip candidate replaces only that clip.
- Accepting a timeline candidate modifies all eligible clips in order.

## Phase 6 — Multi-input renderer and export

- [ ] Define structured project render input.
- [ ] Implement multi-input FFmpeg composition.
- [ ] Normalize video/audio streams before concat.
- [ ] Handle clips without audio with generated silence.
- [ ] Apply per-clip `setpts` and chained `atempo`.
- [ ] Preserve existing output presets and resize modes.
- [ ] Add export cancellation and progress tied to job ID.

Acceptance:

- A project with multiple source files exports as one continuous file.
- Exported duration matches timeline duration within a documented tolerance.
- Voice pitch remains stable when speed changes.

## Phase 7 — Self-contained distribution

- [x] Prepare FFmpeg and FFprobe sidecars for Linux as well as Windows/macOS.
- [x] Make official Tauri bundles include the sidecars for each target.
- [x] Keep Snap package-contained binaries and add Flatpak-contained binaries.
- [x] Remove release-time dependence on system FFmpeg from every CI job.
- [x] Add packaged-artifact smoke tests for both binaries.
- [x] Update user-facing missing-engine messages.
- [x] Clarify development-only prerequisites in README and CONTRIBUTING.
- [x] Preserve FFmpeg license/configuration notices in release documentation.

Acceptance:

- Official artifacts work on a clean machine without FFmpeg installed.
- CI fails if an artifact cannot execute its bundled FFmpeg and FFprobe.
- Users are never instructed to install Rust, Node, pnpm, or FFmpeg for a compiled release.

## Phase 8 — Verification and hardening

- [ ] Add TypeScript unit-test infrastructure if needed.
- [ ] Add Rust unit tests for filter generation and time mapping.
- [ ] Add migration tests for legacy projects.
- [ ] Add end-to-end editor workflow coverage.
- [ ] Run frontend typecheck and build.
- [ ] Run Rust check and tests.
- [ ] Run Linux release verification.
- [ ] Perform visual review against the supplied screenshots and existing design document.
- [ ] Check accessibility, focus, keyboard shortcuts, reduced motion, and icon labels.

## Dependency order

```text
contracts
  -> domain model/migration
    -> editor shell/actions
      -> timeline editing
        -> derived preview jobs
          -> detection candidate workflow
            -> multi-input export
              -> self-contained packaging
                -> end-to-end hardening
```

## Known risks

- FFmpeg sidecar availability differs by architecture and platform; each target needs a pinned, verified binary strategy.
- Multi-input concat requires explicit stream normalization for videos with different dimensions, FPS, codecs, and audio layouts.
- Full-sequence preview can be expensive for long projects; the scheduler must prioritize responsiveness over instant full renders.
- Mapping timeline detection results through clip speed requires precise floating-point boundary handling and tests.
- The current code has no frontend test runner; introducing one must be done deliberately and kept lightweight.
