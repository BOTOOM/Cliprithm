#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FULL_CLEAN=false
DRY_RUN=false

shopt -s nullglob

for arg in "$@"; do
  case "$arg" in
    --full)
      FULL_CLEAN=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Uso: bash scripts/clean-artifacts.sh [--full] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

paths=(
  "dist"
  "src-tauri/gen"
  "src-tauri/target"
  "packaging/snap/.snapcraft"
  "packaging/snap/parts"
  "packaging/snap/prime"
  "packaging/snap/stage"
)

glob_paths=(
  "packaging/snap/*.snap"
)

if [ "$FULL_CLEAN" = true ]; then
  paths+=(
    "node_modules"
    ".playwright-mcp"
  )
fi

remove_path() {
  local relative_path="$1"
  local absolute_path="$ROOT_DIR/$relative_path"

  if [ ! -e "$absolute_path" ]; then
    return
  fi

  local size
  size="$(du -sh "$absolute_path" 2>/dev/null | cut -f1 || echo "?")"
  echo "Removing $relative_path ($size)"

  if [ "$DRY_RUN" = false ]; then
    rm -rf "$absolute_path"
  fi
}

remove_glob() {
  local relative_pattern="$1"
  local absolute_pattern="$ROOT_DIR/$relative_pattern"
  local matches=($absolute_pattern)
  local absolute_path=""
  local relative_path=""

  if [ "${#matches[@]}" -eq 0 ]; then
    return
  fi

  for absolute_path in "${matches[@]}"; do
    relative_path="${absolute_path#"$ROOT_DIR"/}"
    remove_path "$relative_path"
  done
}

echo "Cliprithm cleanup"
echo "Root: $ROOT_DIR"

for path in "${paths[@]}"; do
  remove_path "$path"
done

for path in "${glob_paths[@]}"; do
  remove_glob "$path"
done

if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete."
else
  echo "Cleanup complete."
fi
