#!/usr/bin/env bash
#
# auto-update.sh — pull latest code and rebuild the Compose stack if changed.
#
# Fetches the tracked branch; if the local checkout is behind, it fast-forwards
# and rebuilds/restarts the production stack. No-op when already up to date.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="${REPO_DIR}/.auto-update.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cd "$REPO_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Checking updates on branch '${BRANCH}'..."

git fetch --quiet origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}")"

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date (${LOCAL:0:8}). No action."
    exit 0
fi

log "Update found: ${LOCAL:0:8} -> ${REMOTE:0:8}. Pulling..."
git pull --ff-only origin "$BRANCH"

log "Rebuilding and restarting stack..."
docker compose -f "$COMPOSE_FILE" up -d --build

log "Update complete (now at ${REMOTE:0:8})."
