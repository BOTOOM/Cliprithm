#!/usr/bin/env bash
set -euo pipefail

# Build the Flatpak package for Cliprithm.
#
# Modes:
#   (auto)    Detects docker or native flatpak-builder automatically
#   --docker  Build inside a Docker container (recommended on Manjaro/Arch)
#   --native  Build using the locally installed flatpak-builder
#
# Optional flags:
#   --install  After a native build, install the flatpak locally for testing

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$repo_root/packaging/flatpak/com.botom.cliprithm.yml"
app_id="com.botom.cliprithm"

# Lighter base image than the old GitHub Actions image. We install
# flatpak/flatpak-builder on demand inside the container to keep the Docker
# footprint smaller on the host.
FLATPAK_DOCKER_IMAGE="ubuntu:24.04"

# Named Docker volume used to cache downloaded runtimes and SDK extensions
# between builds. Delete it to force a clean re-download:
#   docker volume rm cliprithm-flatpak-cache
FLATPAK_CACHE_VOLUME="cliprithm-flatpak-cache"

mode="auto"
install_after_build=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker)
      mode="docker"
      shift
      ;;
    --native)
      mode="native"
      shift
      ;;
    --install)
      install_after_build=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--docker|--native] [--install]" >&2
      exit 1
      ;;
  esac
done

if [[ "$mode" == "auto" ]]; then
  if command -v docker >/dev/null 2>&1; then
    mode="docker"
  elif command -v flatpak-builder >/dev/null 2>&1; then
    mode="native"
  else
    echo "Neither Docker nor flatpak-builder is available." >&2
    echo "Install Docker (recommended on Manjaro) or flatpak-builder to build this package." >&2
    echo "  Docker:          https://docs.docker.com/engine/install/" >&2
    echo "  flatpak-builder: sudo pacman -S flatpak flatpak-builder" >&2
    exit 1
  fi
fi

mkdir -p "$repo_root/dist"

case "$mode" in
  docker)
    if ! command -v docker >/dev/null 2>&1; then
      echo "Docker is not installed or not in PATH." >&2
      exit 1
    fi

    echo "==> Building Flatpak in Docker"
    echo "    Image : $FLATPAK_DOCKER_IMAGE"
    echo "    Cache : docker volume '$FLATPAK_CACHE_VOLUME' (Flatpak runtimes/SDKs cached between builds)"
    echo "    Output: dist/${app_id}.flatpak"
    echo ""
    echo "    First run installs flatpak-builder and downloads runtimes. Subsequent builds reuse the Flatpak cache volume."
    echo ""

    docker run --rm --privileged \
      --volume "$repo_root":/project:ro \
      --volume "$FLATPAK_CACHE_VOLUME":/var/lib/flatpak \
      --volume "$repo_root/dist":/dist \
      "$FLATPAK_DOCKER_IMAGE" \
      bash -c "
        set -euo pipefail
        export DEBIAN_FRONTEND=noninteractive

        apt-get update -qq >/dev/null
        apt-get install -y --no-install-recommends \
          bubblewrap \
          ca-certificates \
          elfutils \
          flatpak \
          flatpak-builder \
          xz-utils >/dev/null

        flatpak remote-add --if-not-exists flathub \
          https://dl.flathub.org/repo/flathub.flatpakrepo

        echo '==> Running flatpak-builder...'
        flatpak-builder \
          --force-clean \
          --disable-rofiles-fuse \
          --install-deps-from=flathub \
          --repo=/tmp/repo \
          /tmp/build-dir \
          /project/packaging/flatpak/com.botom.cliprithm.yml

        echo '==> Creating .flatpak bundle...'
        flatpak build-bundle \
          /tmp/repo \
          /dist/${app_id}.flatpak \
          ${app_id}

        echo '==> Done: dist/${app_id}.flatpak'
      "

    echo ""
    echo "==> Bundle ready: dist/${app_id}.flatpak"
    echo "    Note: file may be root-owned (Docker runs as root)."
    echo "    Fix with: sudo chown \$USER dist/${app_id}.flatpak"
    echo ""
    echo "    To install and test locally:"
    echo "      flatpak install --user dist/${app_id}.flatpak"
    echo "      flatpak run ${app_id}"
    ;;

  native)
    if ! command -v flatpak-builder >/dev/null 2>&1; then
      echo "flatpak-builder is not installed." >&2
      echo "Install it with:" >&2
      echo "  sudo pacman -S flatpak flatpak-builder   # Arch / Manjaro" >&2
      echo "  sudo apt install flatpak flatpak-builder  # Debian / Ubuntu" >&2
      echo "Or use Docker instead: bash scripts/build_flatpak.sh --docker" >&2
      exit 1
    fi

    echo "==> Building Flatpak natively with flatpak-builder"
    echo "    Output: dist/${app_id}.flatpak"

    if ! flatpak remote-list --user 2>/dev/null | grep -q flathub && \
       ! flatpak remote-list --system 2>/dev/null | grep -q flathub; then
      echo "==> Adding Flathub remote..."
      flatpak remote-add --if-not-exists --user flathub \
        https://dl.flathub.org/repo/flathub.flatpakrepo
    fi

    build_dir="$repo_root/dist/flatpak-build"
    repo_dir="$repo_root/dist/flatpak-repo"

    flatpak-builder \
      --force-clean \
      --install-deps-from=flathub \
      --repo="$repo_dir" \
      "$build_dir" \
      "$manifest"

    echo "==> Creating .flatpak bundle..."
    flatpak build-bundle \
      "$repo_dir" \
      "$repo_root/dist/${app_id}.flatpak" \
      "$app_id"

    echo ""
    echo "==> Bundle ready: dist/${app_id}.flatpak"

    if $install_after_build; then
      echo "==> Installing locally for testing..."
      flatpak install --user --reinstall "$repo_root/dist/${app_id}.flatpak"
      echo "    Run with: flatpak run ${app_id}"
    else
      echo "    To install and test: bash scripts/build_flatpak.sh --native --install"
    fi
    ;;
esac
