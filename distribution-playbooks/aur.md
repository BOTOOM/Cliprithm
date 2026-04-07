# AUR

## Packages

Cliprithm should maintain two AUR packages:

1. `cliprithm` - source-based build for users who prefer compiling from source.
2. `cliprithm-bin` - prebuilt package for faster installation on Arch/Manjaro.

## Why both

- `cliprithm` matches the spirit of AUR source packages and is good for users who already have Rust/Node tooling.
- `cliprithm-bin` is better UX for end users because it avoids building Tauri during install.

## Artifact strategy

- `cliprithm` consumes the tagged GitHub source tarball.
- `cliprithm-bin` consumes the release AppImage.
- The `cliprithm-bin` wrapper exports `APPIMAGE_EXTRACT_AND_RUN=1` to avoid common AppImage integration problems on Arch-family systems.
- Both wrappers now also export **distribution-channel env vars** so the app knows it was installed from AUR and switches to **store-managed** update guidance instead of self-updating from GitHub.
- `cliprithm` / `cliprithm-bin` can now surface newer package versions through the **AUR RPC API**.

## Local verification

```bash
# Build the exact Linux artifacts shipped to users
npm run verify:linux-release

# Validate the source AUR package metadata and sources
npm run verify:aur:source

# Validate the binary AUR package against the locally built AppImage
npm run verify:aur:bin
```

Optional full package build:

```bash
bash scripts/verify_aur_package.sh source --build-package
bash scripts/verify_aur_package.sh bin --build-package
```

## Publishing notes

- Keep `cliprithm` and `cliprithm-bin` in separate AUR git repositories.
- Use distinct repository URLs/secrets if release automation is later expanded to push both packages.
- Bump `pkgrel` when the PKGBUILD changes but the upstream app version does not.
