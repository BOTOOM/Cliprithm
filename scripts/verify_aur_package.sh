#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/verify_aur_package.sh source [--build-package]
  scripts/verify_aur_package.sh bin [--build-release] [--deb /absolute/or/relative/path] [--build-package]

What it does:
  1. Generates PKGBUILD + .SRCINFO locally
  2. Validates .SRCINFO with makepkg --printsrcinfo
  3. Verifies package sources with makepkg --verifysource
  4. Optionally builds the package with makepkg -f

Notes:
  - For 'bin', --build-release can be used to first generate the local .deb that cliprithm-bin consumes.
  - For 'bin', the default .deb path matches the local Tauri release output.
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

package_kind="$1"
shift

if [[ "$package_kind" != "source" && "$package_kind" != "bin" ]]; then
  usage
  exit 1
fi

build_release=0
build_package=0
deb_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-release)
      build_release=1
      ;;
    --build-package)
      build_package=1
      ;;
    --deb)
      deb_path="$2"
      shift
      ;;
    --)
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if ! command -v makepkg >/dev/null 2>&1; then
  echo "makepkg is required to validate AUR packages locally." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"
tag="cliprithm-v${version}"
workspace="$(mktemp -d)"

cleanup() {
  if [[ "${KEEP_AUR_WORKSPACE:-0}" == "1" ]]; then
    echo "Keeping generated workspace at: $workspace"
    return
  fi

  rm -rf "$workspace"
}

trap cleanup EXIT

echo "==> Generating ${package_kind} AUR package metadata for Cliprithm ${version}"

if [[ "$package_kind" == "source" ]]; then
  python3 scripts/generate_aur_package.py \
    --package source \
    --version "$version" \
    --tag "$tag" \
    --output-dir "$workspace"
else
  if [[ "$build_release" -eq 1 ]]; then
    bash scripts/verify_release_linux.sh
  fi

  if [[ -z "$deb_path" ]]; then
    deb_path="src-tauri/target/release/bundle/deb/Cliprithm_${version}_amd64.deb"
  fi

  if [[ ! -f "$deb_path" ]]; then
    echo "Debian package not found: $deb_path" >&2
    echo "Build it first with 'bash scripts/verify_release_linux.sh' or pass --build-release." >&2
    exit 1
  fi

  python3 scripts/generate_aur_package.py \
    --package bin \
    --version "$version" \
    --tag "$tag" \
    --output-dir "$workspace" \
    --artifact-url "file://$(realpath "$deb_path")" \
    --icon-url "file://$(realpath src-tauri/icons/128x128.png)" \
    --license-url "file://$(realpath LICENSE)"
fi

pushd "$workspace" >/dev/null

verify_built_bin_package() {
  local package_file
  package_file="$(find "$PWD" -maxdepth 1 -type f -name 'cliprithm-bin-*.pkg.tar*' | sort | tail -n 1)"

  if [[ -z "$package_file" || ! -f "$package_file" ]]; then
    echo "Built cliprithm-bin package was not found." >&2
    exit 1
  fi

  local package_contents
  package_contents="$(bsdtar -tf "$package_file")"

  if ! grep -Fxq "usr/bin/cliprithm" <<<"$package_contents"; then
    echo "Built package does not contain /usr/bin/cliprithm." >&2
    exit 1
  fi

  if grep -Fxq "usr/bin/ffmpeg" <<<"$package_contents" ||
    grep -Fxq "usr/bin/ffprobe" <<<"$package_contents"; then
    echo "Built package still contains system-owned FFmpeg paths." >&2
    exit 1
  fi
}

echo "==> Validating generated .SRCINFO"
makepkg --printsrcinfo > .SRCINFO.generated
diff -u .SRCINFO .SRCINFO.generated
rm -f .SRCINFO.generated

echo "==> Verifying package sources"
makepkg --verifysource

if [[ "$build_package" -eq 1 ]]; then
  echo "==> Building package with makepkg -f"
  makepkg -f

  if [[ "$package_kind" == "bin" ]]; then
    echo "==> Verifying packaged .deb contents"
    verify_built_bin_package
  fi
fi

popd >/dev/null

echo
echo "AUR verification completed successfully in: $workspace"
echo "PKGBUILD and .SRCINFO were generated locally and validated with makepkg."
echo "Set KEEP_AUR_WORKSPACE=1 if you want to inspect the generated package directory afterwards."
