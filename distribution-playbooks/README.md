# Distribution Playbooks

This folder is tracked on purpose so release and packaging notes stay close to the codebase.

Current playbooks:

- `aur.md` - source and binary AUR strategy, required repos, and local verification flow
- `snap.md` - Docker-first Snap build flow, Manjaro local install/testing, and first vs later publication cases
- `flatpak.md` - Docker-first Flatpak build flow, Manjaro local install/testing, and first vs later Flathub publication cases
- `homebrew.md` - Homebrew Cask step-by-step flow for custom tap or official cask

Related repo scaffolding:

- `packaging/linux/` - shared desktop and metainfo metadata
- `packaging/flatpak/` - initial Flatpak manifest
- `packaging/snap/` - initial snapcraft config and command-chain wrapper
- `packaging/homebrew/` - Homebrew Cask template

## GitHub configuration summary

- **AUR**
  - Secret already used: `AUR_SSH_PRIVATE_KEY`
  - Optional variable already used: `AUR_PACKAGE_REPO_SSH_URL`
- **Snap**
  - Official secret/env: `SNAPCRAFT_STORE_CREDENTIALS`
  - Recommended repo vars: `SNAP_NAME`, `SNAP_RELEASE_CHANNEL`
- **Flatpak / Flathub**
  - No mandatory store secret for the first manual submission PR
  - Recommended repo vars: `FLATPAK_APP_ID`, `FLATHUB_REPO`
  - Optional repo secret for future automation: `FLATHUB_GITHUB_TOKEN`
- **Homebrew**
  - If this repo updates a separate tap repo: `HOMEBREW_TAP_GITHUB_TOKEN`
  - Recommended repo vars: `HOMEBREW_TAP_REPOSITORY`, `HOMEBREW_CASK_PATH`

The goal is to keep deployment knowledge versioned even before every channel is automated, so each store can be published with a repeatable checklist similar to the AUR flow.
