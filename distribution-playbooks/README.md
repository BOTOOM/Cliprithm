# Distribution Playbooks

This folder is tracked on purpose so release and packaging notes stay close to the codebase.

Current playbooks:

- `aur.md` - source and binary AUR strategy, required repos, and local verification flow
- `snap.md` - Snap packaging direction and operational notes
- `flatpak.md` - Flatpak packaging direction and what would need to move into the manifest
- `homebrew.md` - Homebrew Cask notes for desktop distribution outside Linux package managers

Related repo scaffolding:

- `packaging/linux/` - shared desktop and metainfo metadata
- `packaging/flatpak/` - initial Flatpak manifest
- `packaging/snap/` - initial snapcraft config and command-chain wrapper
- `packaging/homebrew/` - Homebrew Cask template

The goal is to keep deployment knowledge versioned even before every channel is automated.
