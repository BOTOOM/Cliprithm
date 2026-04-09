#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
snap_dir="$repo_root/packaging/snap"
snapcraft_docker_image="myroslavmail/snapcraft:stable"

mode="auto"
declare -a extra_args=()
remote_workspace=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --destructive|--use-lxd|--remote|--docker)
      mode="${1#--}"
      shift
      ;;
    *)
      extra_args+=("$1")
      shift
      ;;
  esac
done

if [[ "$mode" != "docker" ]] && ! command -v snapcraft >/dev/null 2>&1; then
  echo "snapcraft is not installed. Install it first with: sudo snap install snapcraft --classic" >&2
  echo "Or build with Docker (no snapcraft needed on the host): bash scripts/build_snap.sh --docker" >&2
  exit 1
fi

cleanup() {
  if [[ -n "$remote_workspace" && -d "$remote_workspace" ]]; then
    rm -rf "$remote_workspace"
  fi
}
trap cleanup EXIT

os_id=""
os_version=""
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  os_id="${ID:-}"
  os_version="${VERSION_ID:-}"
fi

is_supported_destructive_host=false
if [[ "$os_id" == "ubuntu" && ( "$os_version" == "24.04" || "$os_version" == "22.04" ) ]]; then
  is_supported_destructive_host=true
fi

has_lxd=false
if command -v lxd >/dev/null 2>&1 || command -v lxc >/dev/null 2>&1; then
  has_lxd=true
elif command -v snap >/dev/null 2>&1 && snap list lxd >/dev/null 2>&1; then
  has_lxd=true
fi

in_lxd_group=false
if id -nG 2>/dev/null | tr ' ' '\n' | grep -qx "lxd"; then
  in_lxd_group=true
fi

has_snapcraft_auth=false
if [[ -n "${SNAPCRAFT_STORE_CREDENTIALS:-}" ]]; then
  has_snapcraft_auth=true
elif command -v timeout >/dev/null 2>&1 && timeout 10s snapcraft whoami >/dev/null 2>&1; then
  has_snapcraft_auth=true
elif snapcraft whoami >/dev/null 2>&1; then
  has_snapcraft_auth=true
fi

prepare_remote_workspace() {
  remote_workspace="$(mktemp -d)"
  local worktree="$remote_workspace/repo"
  local path=""

  mkdir -p "$worktree"

  while IFS= read -r -d '' path; do
    mkdir -p "$worktree/$(dirname "$path")"
    cp -a "$repo_root/$path" "$worktree/$path"
  done < <(
    cd "$repo_root" && {
      git ls-files -z
      git ls-files --others --exclude-standard -z
    }
  )

  mkdir -p "$worktree/snap"

  sed 's#source: \.\./\.\.#source: ..#' \
    "$repo_root/packaging/snap/snapcraft.yaml" > "$worktree/snap/snapcraft.yaml"

  git -C "$worktree" init -q
  git -C "$worktree" config user.name "cliprithm-snap-helper"
  git -C "$worktree" config user.email "cliprithm-snap-helper@example.invalid"
  git -C "$worktree" add -A
  git -C "$worktree" commit -qm "Prepare Snapcraft remote build workspace"

  printf '%s\n' "$worktree"
}

case "$mode" in
  auto)
    if $is_supported_destructive_host; then
      mode="destructive"
    elif $has_lxd; then
      mode="use-lxd"
    elif command -v docker >/dev/null 2>&1; then
      mode="docker"
    else
      echo "This host cannot use Snapcraft destructive mode for core24 builds." >&2
      echo "Recommended next steps:" >&2
      echo "  1. Install Docker and run: bash scripts/build_snap.sh --docker" >&2
      echo "  2. Install and initialize LXD, then run: bash scripts/build_snap.sh --use-lxd" >&2
      echo "  3. Or use Launchpad remote builders: bash scripts/build_snap.sh --remote" >&2
      exit 1
    fi
    ;;
  destructive)
    if ! $is_supported_destructive_host; then
      echo "Destructive mode is only supported here on Ubuntu 22.04/24.04 for this core24 snap." >&2
      echo "Use --docker, --use-lxd or --remote instead." >&2
      exit 1
    fi
    ;;
  docker)
    if ! command -v docker >/dev/null 2>&1; then
      echo "Docker is not installed or not in PATH." >&2
      exit 1
    fi
    ;;
  use-lxd)
    if ! $has_lxd; then
      echo "LXD is not available. Install/configure it first or use --remote." >&2
      exit 1
    fi
    if ! $in_lxd_group; then
      echo "LXD is installed, but this shell is not active in the lxd group yet." >&2
      echo 'Run: newgrp lxd' >&2
      echo "Or log out and back in, then re-run the build." >&2
      exit 1
    fi
    ;;
  remote)
    if ! $has_snapcraft_auth; then
      echo "Snapcraft remote-build requires authentication first." >&2
      echo "Run 'snapcraft login' or export SNAPCRAFT_STORE_CREDENTIALS before using --remote." >&2
      exit 1
    fi
    ;;
  *)
    echo "Unknown mode: $mode" >&2
    echo "Valid modes: --docker, --destructive, --use-lxd, --remote" >&2
    exit 1
    ;;
esac

case "$mode" in
  destructive)
    cd "$snap_dir"
    echo "==> Building snap with destructive mode on a compatible Ubuntu host"
    snapcraft pack --destructive-mode "${extra_args[@]}"
    ;;
  use-lxd)
    cd "$snap_dir"
    echo "==> Building snap with Snapcraft + LXD"
    snapcraft pack --use-lxd "${extra_args[@]}"
    ;;
  docker)
    # snapcore/snapcraft:* on Docker Hub is frozen on Snapcraft 4.x and does
    # not support this project's core24 + gnome extension. Use a maintained
    # Snapcraft 8 image instead.
    #
    # The project root is mounted at /project. Since snapcraft.yaml uses
    # source: ../.. relative to packaging/snap/, this resolves to /project
    # correctly when the working directory is /project/packaging/snap.
    echo "==> Building snap in Docker ($snapcraft_docker_image)"
    mkdir -p "$repo_root/dist"
    docker run --rm \
      --volume "$repo_root":/project \
      --workdir /project/packaging/snap \
      "$snapcraft_docker_image" \
      bash -lc '
        set -euo pipefail
        if [[ ! -e /snap/snapcraft/current/usr/share/snapcraft/extensions/desktop/command-chain ]] \
          && [[ -d /snap/snapcraft/current/share/snapcraft/extensions/desktop/command-chain ]]; then
          mkdir -p /snap/snapcraft/current/usr/share/snapcraft
          ln -s /snap/snapcraft/current/share/snapcraft/extensions \
            /snap/snapcraft/current/usr/share/snapcraft/extensions
        fi
        exec snapcraft pack --destructive-mode "$@"
      ' _ "${extra_args[@]}"
    snap_file="$(ls "$snap_dir"/*.snap 2>/dev/null | sort -V | tail -1)" || true
    if [[ -n "${snap_file:-}" ]]; then
      mv "$snap_file" "$repo_root/dist/"
      echo "==> Snap package ready: dist/$(basename "$snap_file")"
      echo "    Note: file may be root-owned. Run: sudo chown \$USER dist/*.snap"
    fi
    ;;
  remote)
    workspace="$(prepare_remote_workspace)"
    cd "$workspace"
    echo "==> Building snap with Launchpad remote-build from a temporary top-level git workspace"
    snapcraft remote-build --launchpad-accept-public-upload "${extra_args[@]}"
    ;;
esac
