#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FULL_CLEAN=false
DRY_RUN=false

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
)

if [ "$FULL_CLEAN" = true ]; then
  paths+=("node_modules")
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

echo "Cliprithm cleanup"
echo "Root: $ROOT_DIR"

for path in "${paths[@]}"; do
  remove_path "$path"
done

if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete."
else
  echo "Cleanup complete."
fi
