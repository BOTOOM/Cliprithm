#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/verify_aur_package.sh source [--build-package]
  scripts/verify_aur_package.sh bin [--build-release] [--appimage /absolute/or/relative/path] [--build-package]

What it does:
  1. Generates PKGBUILD + .SRCINFO locally
  2. Validates .SRCINFO with makepkg --printsrcinfo
  3. Verifies package sources with makepkg --verifysource
  4. Optionally builds the package with makepkg -f

Notes:
  - For 'bin', --build-release can be used to first generate the local AppImage that cliprithm-bin would consume.
  - For 'bin', the default AppImage path matches the local Tauri release output.
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
appimage_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-release)
      build_release=1
      ;;
    --build-package)
      build_package=1
      ;;
    --appimage)
      appimage_path="$2"
      shift
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

  if [[ -z "$appimage_path" ]]; then
    appimage_path="src-tauri/target/release/bundle/appimage/Cliprithm_${version}_amd64.AppImage"
  fi

  if [[ ! -f "$appimage_path" ]]; then
    echo "AppImage not found: $appimage_path" >&2
    echo "Build it first with 'bash scripts/verify_release_linux.sh' or pass --build-release." >&2
    exit 1
  fi

  python3 scripts/generate_aur_package.py \
    --package bin \
    --version "$version" \
    --tag "$tag" \
    --output-dir "$workspace" \
    --artifact-url "file://$(realpath "$appimage_path")" \
    --icon-url "file://$(realpath src-tauri/icons/128x128.png)" \
    --license-url "file://$(realpath LICENSE)"
fi

pushd "$workspace" >/dev/null

echo "==> Validating generated .SRCINFO"
makepkg --printsrcinfo > .SRCINFO.generated
diff -u .SRCINFO .SRCINFO.generated
rm -f .SRCINFO.generated

echo "==> Verifying package sources"
makepkg --verifysource

if [[ "$build_package" -eq 1 ]]; then
  echo "==> Building package with makepkg -f"
  makepkg -f
fi

popd >/dev/null

echo
echo "AUR verification completed successfully in: $workspace"
echo "PKGBUILD and .SRCINFO were generated locally and validated with makepkg."
echo "Set KEEP_AUR_WORKSPACE=1 if you want to inspect the generated package directory afterwards."
