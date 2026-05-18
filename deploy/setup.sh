#!/usr/bin/env bash
# DIKLY Full-Stack VPS Setup Script
# Run as root on a fresh Ubuntu 22.04 server
# Usage: bash setup.sh
set -euo pipefail

DIKLY_USER="dikly"
NODE_VERSION="20"
REPO_URL="https://github.com/isaacaryeepah-beep/KODEX.git"
APP_DIR="/home/${DIKLY_USER}/KODEX"
JITSI_DIR="/home/${DIKLY_USER}/jitsi"
SERVER_IP="${SERVER_IP:-$(curl -s https://api.ipify.org)}"

echo "═══════════════════════════════════════════════════════"
echo "  DIKLY VPS Setup  (IP: ${SERVER_IP})"
echo "═══════════════════════════════════════════════════════"

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/10] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq git curl wget unzip ufw fail2ban nginx \
    certbot python3-certbot-nginx

# ── 2. Firewall ───────────────────────────────────────────────────────────────
echo "[2/10] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     comment 'SSH'
ufw allow 80/tcp     comment 'HTTP'
ufw allow 443/tcp    comment 'HTTPS'
ufw allow 10000/udp  comment 'JVB WebRTC media'
ufw allow 4443/tcp   comment 'JVB TCP fallback'
ufw --force enable
echo "UFW status:"
ufw status

# ── 3. Fail2ban ───────────────────────────────────────────────────────────────
echo "[3/10] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable fail2ban && systemctl restart fail2ban

# ── 4. App user ───────────────────────────────────────────────────────────────
echo "[4/10] Creating app user '${DIKLY_USER}'..."
if ! id "${DIKLY_USER}" &>/dev/null; then
    adduser --disabled-password --gecos "" "${DIKLY_USER}"
    usermod -aG sudo "${DIKLY_USER}"
fi

# ── 5. Docker ─────────────────────────────────────────────────────────────────
echo "[5/10] Installing Docker + Compose plugin..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "${DIKLY_USER}"
systemctl enable docker

# ── 6. Clone / update DIKLY repo ─────────────────────────────────────────────
echo "[6/10] Cloning DIKLY repository..."
if [ ! -d "${APP_DIR}" ]; then
    sudo -u "${DIKLY_USER}" git clone "${REPO_URL}" "${APP_DIR}"
else
    sudo -u "${DIKLY_USER}" git -C "${APP_DIR}" pull --ff-only
fi

# ── 7. Jitsi directory ────────────────────────────────────────────────────────
echo "[7/10] Preparing Jitsi directory..."
sudo -u "${DIKLY_USER}" mkdir -p "${JITSI_DIR}/jitsi-config"
cp "${APP_DIR}/docker-compose.jitsi.yml" "${JITSI_DIR}/"
cp "${APP_DIR}/deploy/jitsi.env.example" "${JITSI_DIR}/.env.example"

# ── 8. Nginx — unified all-subdomain config ───────────────────────────────────
echo "[8/10] Installing nginx config (all 6 subdomains)..."
cp "${APP_DIR}/deploy/nginx-all.conf" /etc/nginx/sites-available/dikly-all

# Remove legacy single-site configs if present
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/dikly
rm -f /etc/nginx/sites-enabled/jitsi

ln -sf /etc/nginx/sites-available/dikly-all /etc/nginx/sites-enabled/dikly-all
nginx -t && systemctl reload nginx

# ── 9. SSL certificates ───────────────────────────────────────────────────────
echo "[9/10] SSL certificate setup..."
echo ""
echo "  Run the following after DNS A records propagate:"
echo ""
echo "    certbot --nginx \\"
echo "      -d dikly.live -d www.dikly.live \\"
echo "      -d app.dikly.live \\"
echo "      -d monitor.dikly.live \\"
echo "      -d api.dikly.live \\"
echo "      -d admin.dikly.live \\"
echo "      -d meet.dikly.live"
echo ""

# ── 10. DIKLY app env + Docker stack ─────────────────────────────────────────
echo "[10/10] Preparing DIKLY Docker stack..."
if [ ! -f "${APP_DIR}/.env" ]; then
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    echo "  ✓ Created ${APP_DIR}/.env — EDIT THIS FILE before starting the stack"
else
    echo "  ✓ ${APP_DIR}/.env already exists"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Setup complete. Manual steps remaining:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  1. Add DNS A records (all must point to ${SERVER_IP}):"
echo "       dikly.live         → ${SERVER_IP}"
echo "       www.dikly.live     → ${SERVER_IP}"
echo "       app.dikly.live     → ${SERVER_IP}"
echo "       monitor.dikly.live → ${SERVER_IP}"
echo "       api.dikly.live     → ${SERVER_IP}"
echo "       admin.dikly.live   → ${SERVER_IP}"
echo "       meet.dikly.live    → ${SERVER_IP}"
echo ""
echo "  2. After DNS propagates, get SSL certificates:"
echo "       certbot --nginx \\"
echo "         -d dikly.live -d www.dikly.live \\"
echo "         -d app.dikly.live -d monitor.dikly.live \\"
echo "         -d api.dikly.live -d admin.dikly.live \\"
echo "         -d meet.dikly.live"
echo ""
echo "  3. Configure DIKLY app:"
echo "       nano ${APP_DIR}/.env"
echo "       # Set: MONGODB_URI, JWT_SECRET, JITSI_*, PAYSTACK_*, etc."
echo ""
echo "  4. Start DIKLY stack (app + MongoDB + Redis):"
echo "       cd ${APP_DIR}"
echo "       docker compose up -d --build"
echo "       docker compose logs -f app"
echo ""
echo "  5. Configure & start Jitsi:"
echo "       cp ${JITSI_DIR}/.env.example ${JITSI_DIR}/.env"
echo "       nano ${JITSI_DIR}/.env"
echo "       # Set: JITSI_DOMAIN=meet.dikly.live, JITSI_APP_SECRET (match .env above)"
echo "       cd ${JITSI_DIR}"
echo "       docker compose -f docker-compose.jitsi.yml up -d"
echo "       docker compose -f docker-compose.jitsi.yml logs -f"
echo ""
echo "  6. Verify all services:"
echo "       curl -s https://dikly.live/health | python3 -m json.tool"
echo "       curl -s https://api.dikly.live/health | python3 -m json.tool"
echo "       curl -s https://meet.dikly.live/"
echo ""
