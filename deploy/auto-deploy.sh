#!/bin/bash
# Auto-deploy — runs every minute via cron.
# Pulls main, restarts affected services, reloads nginx when config changes.

# Cron runs with a minimal PATH — set everything needed explicitly.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

REPO=/root/KODEX
LOG=/var/log/kodex-deploy.log
LOCK=/tmp/kodex-deploy.lock
COMPOSE_JITSI="docker compose -f $REPO/docker-compose.jitsi.yml"
COMPOSE_APP="docker compose -f $REPO/docker-compose.yml"
NGINX_CONF=/etc/nginx/sites-available/jitsi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Prevent overlapping cron runs
if [ -f "$LOCK" ]; then
    PID=$(cat "$LOCK")
    kill -0 "$PID" 2>/dev/null && exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

cd "$REPO"

# ── Always keep nginx in sync (handles case where a previous reload failed) ──
if [ -f "$REPO/deploy/nginx-jitsi.conf" ] && [ -f "$NGINX_CONF" ]; then
    if ! diff -q "$REPO/deploy/nginx-jitsi.conf" "$NGINX_CONF" > /dev/null 2>&1; then
        log "nginx config out of sync — resyncing…"
        cp "$REPO/deploy/nginx-jitsi.conf" "$NGINX_CONF"
        nginx -t >> "$LOG" 2>&1 && systemctl reload nginx >> "$LOG" 2>&1 \
            && log "nginx reloaded." || log "nginx reload FAILED — check config."
    fi
fi

# ── Check for new commits ─────────────────────────────────────────────────────
git fetch origin main --quiet 2>> "$LOG"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

[ "$LOCAL" = "$REMOTE" ] && exit 0

log "New commits detected ($LOCAL → $REMOTE). Pulling…"

CHANGED=$(git diff --name-only HEAD origin/main)

git pull --ff-only origin main >> "$LOG" 2>&1

# Ensure init and deploy scripts are always executable
chmod +x "$REPO/jitsi-config/jvb/11-patch.sh" \
         "$REPO/jitsi-config/prosody/11-prosody-ws-ping.sh" \
         "$REPO/deploy/auto-deploy.sh" 2>/dev/null || true

log "Pulled. Changed files:"
echo "$CHANGED" | while read -r f; do log "  $f"; done

# ── Decide what to restart ────────────────────────────────────────────────────

RESTART_JITSI=0
RESTART_APP=0
RELOAD_NGINX=0

echo "$CHANGED" | grep -qE '^(docker-compose\.jitsi\.yml|jitsi-config/)' && RESTART_JITSI=1
echo "$CHANGED" | grep -qE '^(docker-compose\.yml|src/|Dockerfile)'       && RESTART_APP=1
echo "$CHANGED" | grep -qE '^deploy/nginx-jitsi\.conf'                    && RELOAD_NGINX=1

# Jitsi stack
if [ "$RESTART_JITSI" = "1" ]; then
    log "Jitsi config changed — recreating prosody + jvb…"
    rm -rf "$REPO/jitsi-config/prosody/config/"
    rm -f  "$REPO/jitsi-config/jvb/jvb.conf"
    $COMPOSE_JITSI up -d --force-recreate prosody jvb >> "$LOG" 2>&1
    log "Jitsi containers restarted."
fi

# App stack
if [ "$RESTART_APP" = "1" ]; then
    log "App code changed — rebuilding app…"
    $COMPOSE_APP build app >> "$LOG" 2>&1
    $COMPOSE_APP up -d --force-recreate app >> "$LOG" 2>&1
    log "App container restarted."
fi

# nginx
if [ "$RELOAD_NGINX" = "1" ]; then
    log "nginx config changed — updating and reloading…"
    cp "$REPO/deploy/nginx-jitsi.conf" "$NGINX_CONF"
    nginx -t >> "$LOG" 2>&1 && systemctl reload nginx >> "$LOG" 2>&1 \
        && log "nginx reloaded." || log "nginx reload FAILED — check config."
fi

log "Deploy complete."
