# Snap

## Recommended approach

- Prefer a strict Snap only after the filesystem, FFmpeg, and updater behavior are validated inside confinement.
- If strict confinement blocks core media workflows, use classic confinement only if the review burden is acceptable.

## Open questions before implementation

1. Whether bundled FFmpeg stays external or becomes part of the snap runtime story.
2. Whether the Tauri updater should be disabled for Snap builds and delegated to the store update channel.
3. Which interfaces are required for file pickers, desktop integration, and media playback.

## Suggested next step

Create a `snap/snapcraft.yaml` only after the AUR + diagnostics flow is stable and the Linux artifact has been smoke-tested locally.
