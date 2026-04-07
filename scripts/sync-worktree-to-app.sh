#!/usr/bin/env bash
# Sync hi-world-app from your Cursor worktree into the checkout where Metro runs
# (e.g. ~/app/hi-world-app). Override paths if your layout differs.
#
# Usage:
#   chmod +x scripts/sync-worktree-to-app.sh
#   ./scripts/sync-worktree-to-app.sh
#
# Or from repo root:
#   hi-world-app/scripts/sync-worktree-to-app.sh
#
# Environment:
#   SYNC_SOURCE  default: $HOME/.cursor/worktrees/app/tzf/hi-world-app
#   SYNC_DEST    default: $HOME/app/hi-world-app
#   SYNC_DELETE  set to 1 to pass --delete (mirror: remove files in DEST that are gone from SOURCE)
#
set -euo pipefail

SOURCE="${SYNC_SOURCE:-$HOME/.cursor/worktrees/app/tzf/hi-world-app}"
DEST="${SYNC_DEST:-$HOME/app/hi-world-app}"

if [[ ! -d "$SOURCE" ]]; then
  echo "sync-worktree-to-app: source not found: $SOURCE" >&2
  echo "Set SYNC_SOURCE to your worktree hi-world-app path." >&2
  exit 1
fi
if [[ ! -d "$DEST" ]]; then
  echo "sync-worktree-to-app: dest not found: $DEST" >&2
  echo "Set SYNC_DEST to the hi-world-app folder Metro uses (e.g. ~/app/hi-world-app)." >&2
  exit 1
fi

DELETE_ARGS=()
if [[ "${SYNC_DELETE:-0}" == "1" ]]; then
  DELETE_ARGS=(--delete)
  echo "(SYNC_DELETE=1: destination will be mirrored; extra files in DEST may be removed.)"
fi

echo "Syncing:"
echo "  from: $SOURCE"
echo "  to:   $DEST"
echo

rsync -a "${DELETE_ARGS[@]}" \
  --exclude node_modules \
  --exclude .expo \
  --exclude dist \
  --exclude web-build \
  --exclude '.turbo' \
  --exclude coverage \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'backend/.env' \
  --exclude 'backend/.env.*' \
  "$SOURCE/" "$DEST/"

echo
echo "Done. Restart Metro or refresh the browser if the UI looks cached."
