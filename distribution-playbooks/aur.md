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
- `cliprithm-bin` consumes the release `.deb`.
- The AUR `cliprithm-bin` package removes the `.deb` copies of `/usr/bin/ffmpeg` and `/usr/bin/ffprobe`, because those paths belong to Arch's `ffmpeg` package. The `ffmpeg` dependency remains and users provide the system-managed binaries.
- The `cliprithm-bin` wrapper exports `WEBKIT_DISABLE_DMABUF_RENDERING=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, and `LIBGL_ALWAYS_SOFTWARE=1` to avoid common EGL problems on Arch-family systems.
- `cliprithm-bin` keeps `options=('!strip')` as a conservative setting for the prebuilt ELF runtime.
- `cliprithm` supports builders whose `rust`/`cargo` dependency is satisfied by `rustup` without a configured default toolchain by selecting a build-local stable toolchain.
- Both wrappers now also export **distribution-channel env vars** so the app knows it was installed from AUR and switches to **store-managed** update guidance instead of self-updating from GitHub.
- `cliprithm` / `cliprithm-bin` can now surface newer package versions through the **AUR RPC API**.

## Local verification

```bash
# Build the exact Linux artifacts shipped to users
pnpm run verify:linux-release

# Validate the source AUR package metadata and sources
pnpm run verify:aur:source

# Validate the binary AUR package against the locally built .deb
pnpm run verify:aur:bin
```

Optional full package build:

```bash
bash scripts/verify_aur_package.sh source --build-package
bash scripts/verify_aur_package.sh bin --build-package
```

The binary package verification must inspect the built `.pkg.tar.*`, confirm the launcher is present, and confirm that `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` are absent so installation does not conflict with Arch's `ffmpeg` package.

## Publishing notes

- Keep `cliprithm` and `cliprithm-bin` in separate AUR git repositories.
- The release workflow can publish both packages with the same `AUR_SSH_PRIVATE_KEY` as long as that key is authorized in both AUR repositories.
- Bump `pkgrel` when the PKGBUILD changes but the upstream app version does not.

For a packaging-only fix to an already published version:

```bash
version="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"
tag="cliprithm-v${version}"

python3 scripts/generate_aur_package.py --package source --version "$version" --tag "$tag" --pkgrel 2 --output-dir .artifacts/aur/source
python3 scripts/generate_aur_package.py --package bin --version "$version" --tag "$tag" --pkgrel 2 --output-dir .artifacts/aur/bin
```

Then copy each generated `PKGBUILD` and `.SRCINFO` to the matching AUR git repository, commit, and push.

If users have a stale broken local build cached, ask them to clean the yay package artifact before reinstalling:

```bash
yay -Rnc cliprithm-bin || true
rm -rf ~/.cache/yay/cliprithm-bin
yay -S cliprithm-bin
```

## GitHub configuration

- Required secret:
  - `AUR_SSH_PRIVATE_KEY`
- Optional repository variable:
  - `AUR_PACKAGE_REPO_SSH_URL` (defaults to `ssh://aur@aur.archlinux.org/cliprithm.git`)

The release workflow derives `ssh://aur@aur.archlinux.org/cliprithm-bin.git` automatically from that same variable.
