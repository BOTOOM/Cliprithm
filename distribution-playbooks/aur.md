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
- The `cliprithm-bin` wrapper exports `APPIMAGE_EXTRACT_AND_RUN=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, and `LIBGL_ALWAYS_SOFTWARE=1` to avoid common AppImage / EGL problems on Arch-family systems.
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
- The release workflow can publish both packages with the same `AUR_SSH_PRIVATE_KEY` as long as that key is authorized in both AUR repositories.
- Bump `pkgrel` when the PKGBUILD changes but the upstream app version does not.

## GitHub configuration

- Required secret:
  - `AUR_SSH_PRIVATE_KEY`
- Optional repository variable:
  - `AUR_PACKAGE_REPO_SSH_URL` (defaults to `ssh://aur@aur.archlinux.org/cliprithm.git`)

The release workflow derives `ssh://aur@aur.archlinux.org/cliprithm-bin.git` automatically from that same variable.
