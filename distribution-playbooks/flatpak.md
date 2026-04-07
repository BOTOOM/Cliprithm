# Flatpak

## Recommended approach

- Flatpak is a good long-term distribution channel for Linux desktops because it is storefront-friendly and handles runtime dependencies more predictably than ad-hoc installs.
- For Cliprithm, Flatpak likely wants store-managed updates instead of the built-in GitHub updater.

## Important considerations

1. File-system access should go through portals wherever possible.
2. FFmpeg availability must be defined explicitly in the Flatpak manifest.
3. The Tauri log directory and SQLite persistence paths should be checked against Flatpak sandbox behavior.

## Suggested next step

Prototype a Flatpak manifest only after deciding which permissions are truly necessary for local video editing and export.
