#!/usr/bin/env bash
# blue-green.sh — Zero-downtime deployment for Dikly on a single VPS
#
# How it works:
#   Two Docker containers (blue on :5000, green on :5001) take turns being live.
#   This script starts the inactive container, health-checks it, updates nginx
#   to point at the new container, then shuts down the old one.
#   Total downtime: 0 seconds.
#
# Usage:
#   cd /root/KODEX && bash deploy/blue-green.sh
#
# Prerequisites:
#   - Docker installed
#   - nginx installed with /etc/nginx/conf.d/dikly-upstream.conf writable
#   - nginx-all.conf updated to use `proxy_pass http://dikly_app` (upstream block)
#   - Run deploy/setup-nginx-upstream.sh once to prepare nginx

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_UPSTREAM="/etc/nginx/conf.d/dikly-upstream.conf"
NETWORK="kodex_dikly-net"
IMAGE="dikly-app:deploy"
HEALTH_RETRIES=30
HEALTH_WAIT=2

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; exit 1; }

cd "$REPO_DIR"

# ── Detect which slot is active ───────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -q "dikly-blue"; then
  ACTIVE="blue";  INACTIVE="green"
  ACTIVE_PORT=5000; NEW_PORT=5001
else
  ACTIVE="green"; INACTIVE="blue"
  ACTIVE_PORT=5001; NEW_PORT=5000
fi

log "Active slot : $ACTIVE  (port $ACTIVE_PORT)"
log "Deploy slot : $INACTIVE (port $NEW_PORT)"

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code from origin/main..."
git fetch origin main
git reset --hard origin/main

# ── Build new image ───────────────────────────────────────────────────────────
log "Building Docker image..."
docker build -t "$IMAGE" .

# ── Remove stale inactive container if it exists ─────────────────────────────
docker rm -f "dikly-$INACTIVE" 2>/dev/null || true

# ── Start new container ───────────────────────────────────────────────────────
log "Starting dikly-$INACTIVE on port $NEW_PORT..."
docker run -d \
  --name "dikly-$INACTIVE" \
  --env-file .env \
  -p "127.0.0.1:${NEW_PORT}:5000" \
  --network "$NETWORK" \
  --restart unless-stopped \
  "$IMAGE"

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for health check..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -sf "http://127.0.0.1:${NEW_PORT}/health" >/dev/null 2>&1; then
    log "Health check passed on attempt $i"
    break
  fi
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    log "Health check failed — rolling back"
    docker rm -f "dikly-$INACTIVE" || true
    fail "New container never became healthy. Old container ($ACTIVE) is still live."
  fi
  sleep $HEALTH_WAIT
done

# ── Switch nginx upstream ──────────────────────────────────────────────────────
log "Switching nginx → port $NEW_PORT..."
cat > "$NGINX_UPSTREAM" <<EOF
# Managed by blue-green.sh — do not edit manually
# Active slot: $INACTIVE  |  Updated: $(date)
upstream dikly_app {
    server 127.0.0.1:${NEW_PORT};
    keepalive 64;
}
EOF

nginx -t || fail "nginx config test failed — upstream not switched"
nginx -s reload
log "nginx reloaded. Traffic now going to dikly-$INACTIVE (port $NEW_PORT)"

# ── Stop old container ────────────────────────────────────────────────────────
log "Stopping old container dikly-$ACTIVE..."
docker stop "dikly-$ACTIVE" 2>/dev/null || true
docker rm   "dikly-$ACTIVE" 2>/dev/null || true

log "Deployment complete. Active: dikly-$INACTIVE (port $NEW_PORT)"
