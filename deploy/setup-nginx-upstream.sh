#!/usr/bin/env bash
# setup-nginx-upstream.sh — Run ONCE to prepare nginx for blue-green deployments.
#
# What it does:
#   1. Creates /etc/nginx/conf.d/dikly-upstream.conf pointing to port 5000 (blue)
#   2. Replaces all `proxy_pass http://127.0.0.1:5000` in nginx-all.conf with
#      `proxy_pass http://dikly_app` so nginx uses the switchable upstream block
#   3. Copies the updated nginx config to /etc/nginx/sites-available/dikly
#   4. Reloads nginx
#
# Run with: sudo bash deploy/setup-nginx-upstream.sh

set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── Create initial upstream config ────────────────────────────────────────────
log "Creating /etc/nginx/conf.d/dikly-upstream.conf..."
cat > /etc/nginx/conf.d/dikly-upstream.conf <<'EOF'
# Managed by blue-green.sh — do not edit manually
# Active slot: blue
upstream dikly_app {
    server 127.0.0.1:5000;
    keepalive 64;
}
EOF

# ── Patch nginx-all.conf to use upstream ─────────────────────────────────────
log "Patching proxy_pass directives in nginx-all.conf..."
CONF="$REPO_DIR/deploy/nginx-all.conf"
cp "$CONF" "${CONF}.bak"
sed -i 's|proxy_pass http://127.0.0.1:5000;|proxy_pass http://dikly_app;|g' "$CONF"
log "Backup saved as nginx-all.conf.bak"

# ── Install to nginx sites ────────────────────────────────────────────────────
log "Installing to /etc/nginx/sites-available/dikly..."
cp "$CONF" /etc/nginx/sites-available/dikly
ln -sf /etc/nginx/sites-available/dikly /etc/nginx/sites-enabled/dikly

nginx -t || { echo "nginx config test failed"; exit 1; }
nginx -s reload
log "nginx reloaded. Blue-green deployment is ready."
log "Use: bash deploy/blue-green.sh   to deploy future updates."
