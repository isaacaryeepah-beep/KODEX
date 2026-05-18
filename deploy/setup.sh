#!/usr/bin/env bash
# DIKLY + Jitsi VPS Setup Script
# Run as root on a fresh Ubuntu 22.04 Contabo VPS
# Usage: bash setup.sh
set -euo pipefail

DIKLY_USER="dikly"
NODE_VERSION="20"
REPO_URL="https://github.com/isaacaryeepah-beep/KODEX.git"
APP_DIR="/home/${DIKLY_USER}/KODEX"
JITSI_DIR="/home/${DIKLY_USER}/jitsi"

echo "═══════════════════════════════════════"
echo "  DIKLY VPS Setup"
echo "═══════════════════════════════════════"

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/9] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq git curl wget unzip ufw fail2ban nginx certbot python3-certbot-nginx

# ── 2. Firewall ───────────────────────────────────────────────────────────────
echo "[2/9] Configuring firewall..."
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
echo "[3/9] Configuring fail2ban..."
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
echo "[4/9] Creating app user '${DIKLY_USER}'..."
if ! id "${DIKLY_USER}" &>/dev/null; then
    adduser --disabled-password --gecos "" "${DIKLY_USER}"
    usermod -aG sudo "${DIKLY_USER}"
fi

# ── 5. Docker ─────────────────────────────────────────────────────────────────
echo "[5/9] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "${DIKLY_USER}"
systemctl enable docker

# ── 6. Node.js + PM2 ─────────────────────────────────────────────────────────
echo "[6/9] Installing Node.js ${NODE_VERSION} + PM2..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi
npm install -g pm2 --quiet
pm2 startup systemd -u "${DIKLY_USER}" --hp "/home/${DIKLY_USER}" | tail -1 | bash || true

# ── 7. Clone DIKLY repo ───────────────────────────────────────────────────────
echo "[7/9] Cloning DIKLY repository..."
if [ ! -d "${APP_DIR}" ]; then
    sudo -u "${DIKLY_USER}" git clone "${REPO_URL}" "${APP_DIR}"
fi
cd "${APP_DIR}"
sudo -u "${DIKLY_USER}" npm ci --omit=dev --quiet

# ── 8. Jitsi directory ────────────────────────────────────────────────────────
echo "[8/9] Preparing Jitsi directory..."
sudo -u "${DIKLY_USER}" mkdir -p "${JITSI_DIR}/jitsi-config"
cp "${APP_DIR}/docker-compose.jitsi.yml" "${JITSI_DIR}/"
cp "${APP_DIR}/deploy/jitsi.env.example" "${JITSI_DIR}/.env.example"
echo ""
echo "  ┌─────────────────────────────────────────────────────┐"
echo "  │  Next: edit ${JITSI_DIR}/.env with your secrets      │"
echo "  │  Copy from .env.example and fill in real values      │"
echo "  └─────────────────────────────────────────────────────┘"

# ── 9. Nginx configs ──────────────────────────────────────────────────────────
echo "[9/9] Installing nginx configs..."
cp "${APP_DIR}/deploy/nginx-all.conf" /etc/nginx/sites-available/dikly-all
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/dikly
rm -f /etc/nginx/sites-enabled/jitsi
ln -sf /etc/nginx/sites-available/dikly-all /etc/nginx/sites-enabled/dikly-all
nginx -t && systemctl reload nginx

# ── 10. Start DIKLY Docker stack ──────────────────────────────────────────────
echo "[10/10] Starting DIKLY Docker stack..."
cd "${APP_DIR}"
docker compose up -d

echo ""
echo "═══════════════════════════════════════"
echo "  Setup complete. Manual steps remain:"
echo "═══════════════════════════════════════"
echo ""
echo "  1. Add DNS A records in Namecheap:"
echo "       @       → 194.163.172.76"
echo "       www     → 194.163.172.76"
echo "       app     → 194.163.172.76"
echo "       meet    → 194.163.172.76"
echo "       monitor → 194.163.172.76"
echo "       api     → 194.163.172.76"
echo "       admin   → 194.163.172.76"
echo ""
echo "  2. Get SSL certificates (after DNS propagates):"
echo "       certbot --nginx -d dikly.live -d www.dikly.live -d app.dikly.live -d meet.dikly.live -d monitor.dikly.live -d api.dikly.live -d admin.dikly.live"
echo ""
echo "  3. Configure DIKLY app:"
echo "       cp ${APP_DIR}/.env.example ${APP_DIR}/.env"
echo "       nano ${APP_DIR}/.env"
echo ""
echo "  4. Start DIKLY app:"
echo "       cd ${APP_DIR} && sudo -u dikly pm2 start src/server.js --name dikly"
echo "       sudo -u dikly pm2 save"
echo ""
echo "  5. Configure Jitsi:"
echo "       cp ${JITSI_DIR}/.env.example ${JITSI_DIR}/.env"
echo "       nano ${JITSI_DIR}/.env"
echo "       cd ${JITSI_DIR} && docker compose -f docker-compose.jitsi.yml up -d"
echo ""
