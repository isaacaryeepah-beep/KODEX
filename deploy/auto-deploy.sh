#!/bin/bash
# Auto-deploy script — runs via cron every minute.
# Checks if main has new commits; if so, pulls and restarts affected services.
# Set up once with: crontab -e  →  * * * * * /root/KODEX/deploy/auto-deploy.sh

set -euo pipefail

REPO=/root/KODEX
LOG=/var/log/kodex-deploy.log
COMPOSE_JITSI="docker compose -f $REPO/docker-compose.jitsi.yml"
COMPOSE_APP="docker compose -f $REPO/docker-compose.yml"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$REPO"

# Fetch latest from origin without modifying working tree
git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# Nothing new — exit silently
[ "$LOCAL" = "$REMOTE" ] && exit 0

log "New commits detected ($LOCAL → $REMOTE). Pulling…"

# Capture which files changed between current HEAD and new HEAD
CHANGED=$(git diff --name-only HEAD origin/main)

git pull --ff-only origin main >> "$LOG" 2>&1

# Ensure init scripts are always executable (git core.fileMode=false can strip +x)
chmod +x "$REPO/jitsi-config/jvb/11-patch.sh" \
         "$REPO/jitsi-config/prosody/11-prosody-ws-ping.sh" \
         "$REPO/deploy/auto-deploy.sh" 2>/dev/null || true

log "Pulled. Changed files:"
echo "$CHANGED" | while read -r f; do log "  $f"; done

# ── Decide what to restart ────────────────────────────────────────────────────

RESTART_JITSI=0
RESTART_APP=0

echo "$CHANGED" | grep -qE '^(docker-compose\.jitsi\.yml|jitsi-config/)' && RESTART_JITSI=1
echo "$CHANGED" | grep -qE '^(docker-compose\.yml|src/|Dockerfile)' && RESTART_APP=1

# Jitsi stack changes
if [ "$RESTART_JITSI" = "1" ]; then
    log "Jitsi config changed — recreating prosody + jvb…"
    # Clean prosody config so it regenerates from env vars (avoids stale config)
    rm -rf "$REPO/jitsi-config/prosody/config/"
    rm -f  "$REPO/jitsi-config/jvb/jvb.conf"
    $COMPOSE_JITSI up -d --force-recreate prosody jvb >> "$LOG" 2>&1
    log "Jitsi containers restarted."
fi

# App stack changes
if [ "$RESTART_APP" = "1" ]; then
    log "App code changed — rebuilding and restarting app…"
    $COMPOSE_APP build app >> "$LOG" 2>&1
    $COMPOSE_APP up -d --force-recreate app >> "$LOG" 2>&1
    log "App container restarted."
fi

log "Deploy complete."
