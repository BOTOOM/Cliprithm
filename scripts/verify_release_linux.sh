#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script currently validates Linux release artifacts only." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"

echo "==> Building Linux release artifacts for Cliprithm ${version}"
npm run tauri build -- --bundles appimage,deb,rpm

appimage="src-tauri/target/release/bundle/appimage/Cliprithm_${version}_amd64.AppImage"
deb="src-tauri/target/release/bundle/deb/Cliprithm_${version}_amd64.deb"
rpm="src-tauri/target/release/bundle/rpm/Cliprithm-${version}-1.x86_64.rpm"

for artifact in "$appimage" "$deb" "$rpm"; do
  if [[ ! -f "$artifact" ]]; then
    echo "Missing expected artifact: $artifact" >&2
    exit 1
  fi
done

echo
echo "==> Artifact checksums"
sha256sum "$appimage" "$deb" "$rpm"

echo
echo "==> Smoke-run command for the exact AppImage shipped to users"
echo "APPIMAGE_EXTRACT_AND_RUN=1 \"$PWD/$appimage\""

