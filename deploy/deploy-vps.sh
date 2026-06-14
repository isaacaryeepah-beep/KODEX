#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  DIKLY — One-Shot VPS Deploy Script
#  Run as root on a fresh Ubuntu 22.04 Contabo VPS:
#    curl -fsSL https://raw.githubusercontent.com/isaacaryeepah-beep/KODEX/main/deploy/deploy-vps.sh | bash
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC} $*"; }
info() { echo -e "${BLUE}→${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
die()  { echo -e "${RED}✖ $*${NC}"; exit 1; }
header() { echo -e "\n${BOLD}${BLUE}══ $* ══${NC}\n"; }

# ── Config ────────────────────────────────────────────────────────────────────
DIKLY_USER="dikly"
NODE_VERSION="20"
REPO_URL="https://github.com/isaacaryeepah-beep/KODEX.git"
APP_DIR="/home/${DIKLY_USER}/KODEX"
JITSI_DIR="/home/${DIKLY_USER}/jitsi"
DOMAIN="dikly.live"
VPS_IP="194.163.172.76"

SUBDOMAINS=("dikly.live" "www.dikly.live" "app.dikly.live" "meet.dikly.live" "monitor.dikly.live" "api.dikly.live" "admin.dikly.live")

# ═══════════════════════════════════════════════════════════════════════════════
echo -e "${BOLD}"
cat << 'BANNER'
  ██████╗ ██╗██╗  ██╗██╗  ██╗   ██╗
  ██╔══██╗██║██║ ██╔╝██║  ╚██╗ ██╔╝
  ██║  ██║██║█████╔╝ ██║   ╚████╔╝
  ██║  ██║██║██╔═██╗ ██║    ╚██╔╝
  ██████╔╝██║██║  ██╗███████╗██║
  ╚═════╝ ╚═╝╚═╝  ╚═╝╚══════╝╚═╝
     VPS Deploy — One-Shot Setup
BANNER
echo -e "${NC}"

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash deploy-vps.sh"

# ── Collect secrets ───────────────────────────────────────────────────────────
header "Configuration"

echo -e "${BOLD}We need 3 things from you. Everything else is auto-generated.${NC}\n"

read -rp "$(echo -e "${YELLOW}1. MongoDB Atlas URI${NC} (from cloud.mongodb.com → Connect → Drivers)\n   Example: mongodb+srv://user:pass@cluster.mongodb.net/dikly\n   → ")" MONGODB_URI
[[ -z "$MONGODB_URI" ]] && die "MongoDB URI is required"
[[ "$MONGODB_URI" != mongodb* ]] && die "URI must start with mongodb:// or mongodb+srv://"

read -rp "$(echo -e "\n${YELLOW}2. Your email address${NC} (for SSL certificate)\n   → ")" ADMIN_EMAIL
[[ -z "$ADMIN_EMAIL" ]] && die "Email is required"

read -rsp "$(echo -e "\n${YELLOW}3. Paystack secret key${NC} (press Enter to skip — payment features disabled)\n   → ")" PAYSTACK_SECRET
echo ""

# ── Auto-generate all secrets ─────────────────────────────────────────────────
info "Generating secrets…"
JWT_SECRET=$(openssl rand -hex 64)
MEETING_TOKEN_SECRET=$(openssl rand -hex 32)
JITSI_APP_SECRET=$(openssl rand -hex 32)
JICOFO_AUTH_PASSWORD=$(openssl rand -hex 24)
JICOFO_COMPONENT_SECRET=$(openssl rand -hex 24)
JVB_AUTH_PASSWORD=$(openssl rand -hex 24)
MONGO_ROOT_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
ok "All secrets generated"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Deployment plan:${NC}"
echo "  Domain:      $DOMAIN"
echo "  VPS IP:      $VPS_IP"
echo "  Subdomains:  dikly.live, app, meet, monitor, api, admin"
echo "  MongoDB:     $(echo "$MONGODB_URI" | sed 's/:\/\/.*@/:\/\/***@/')"
echo "  Email:       $ADMIN_EMAIL"
echo ""
read -rp "$(echo -e "${BOLD}Continue? [y/N]${NC} ")" CONFIRM
[[ "${CONFIRM,,}" != "y" ]] && die "Aborted"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 1/10 — System update"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  git curl wget unzip ufw fail2ban nginx \
  certbot python3-certbot-nginx dnsutils
ok "System updated"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 2/10 — Firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw allow 10000/udp comment 'JVB WebRTC'
ufw allow 4443/tcp  comment 'JVB TCP fallback'
ufw --force enable
ok "Firewall configured"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 3/10 — Fail2ban"
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable fail2ban --quiet && systemctl restart fail2ban
ok "Fail2ban configured"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 4/10 — App user"
if ! id "${DIKLY_USER}" &>/dev/null; then
  adduser --disabled-password --gecos "" "${DIKLY_USER}"
  usermod -aG sudo "${DIKLY_USER}"
  ok "Created user: ${DIKLY_USER}"
else
  ok "User ${DIKLY_USER} already exists"
fi

# ══════════════════════════════════════════════════════════════════════════════
header "Step 5/10 — Docker"
if ! command -v docker &>/dev/null; then
  info "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
  ok "Docker installed"
else
  ok "Docker already installed"
fi
usermod -aG docker "${DIKLY_USER}"
systemctl enable docker --quiet

# ══════════════════════════════════════════════════════════════════════════════
header "Step 6/10 — Clone DIKLY repo"
if [ -d "${APP_DIR}" ]; then
  info "Updating existing repo…"
  sudo -u "${DIKLY_USER}" git -C "${APP_DIR}" pull --ff-only
else
  sudo -u "${DIKLY_USER}" git clone "${REPO_URL}" "${APP_DIR}"
fi
ok "Repository ready at ${APP_DIR}"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 7/10 — Write .env files"

# ── DIKLY app .env ────────────────────────────────────────────────────────────
cat > "${APP_DIR}/.env" << EOF
NODE_ENV=production
PORT=5000
APP_BASE_URL=https://dikly.live
APP_SUBDOMAIN_APP=https://app.dikly.live
APP_SUBDOMAIN_MONITOR=https://monitor.dikly.live
APP_SUBDOMAIN_API=https://api.dikly.live
APP_SUBDOMAIN_ADMIN=https://admin.dikly.live

MONGODB_URI=${MONGODB_URI}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
MEETING_TOKEN_SECRET=${MEETING_TOKEN_SECRET}

JITSI_DOMAIN=meet.dikly.live
JITSI_APP_ID=dikly
JITSI_APP_SECRET=${JITSI_APP_SECRET}
JITSI_JICOFO_URL=http://127.0.0.1:8888

MONGO_ROOT_USER=dikly
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

PAYSTACK_SECRET_KEY=${PAYSTACK_SECRET:-sk_live_REPLACE_ME}
PAYSTACK_PUBLIC_KEY=pk_live_REPLACE_ME

GMAIL_USER=${ADMIN_EMAIL}
GMAIL_APP_PASSWORD=REPLACE_WITH_APP_PASSWORD
MAILERSEND_API_KEY=

SMS_PROVIDER=arkesel
SMS_SENDER_ID=DIKLY
ARKESEL_API_KEY=

ANTHROPIC_API_KEY=
EOF
chown "${DIKLY_USER}:${DIKLY_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
ok "DIKLY .env written"

# ── Jitsi .env ────────────────────────────────────────────────────────────────
sudo -u "${DIKLY_USER}" mkdir -p "${JITSI_DIR}/jitsi-config"
cat > "${JITSI_DIR}/.env" << EOF
JITSI_DOMAIN=meet.dikly.live
JITSI_APP_ID=dikly
JITSI_APP_SECRET=${JITSI_APP_SECRET}
JICOFO_AUTH_PASSWORD=${JICOFO_AUTH_PASSWORD}
JICOFO_COMPONENT_SECRET=${JICOFO_COMPONENT_SECRET}
JVB_AUTH_PASSWORD=${JVB_AUTH_PASSWORD}
JVB_ADVERTISE_IPS=${VPS_IP}
ENABLE_LETSENCRYPT=0
LETSENCRYPT_EMAIL=${ADMIN_EMAIL}
CONFIG=./jitsi-config
TZ=Africa/Accra
HTTP_PORT=8080
JICOFO_REST_PORT=8888
JVB_PORT=10000
JVB_TCP_PORT=4443
EOF
chown "${DIKLY_USER}:${DIKLY_USER}" "${JITSI_DIR}/.env"
chmod 600 "${JITSI_DIR}/.env"

cp "${APP_DIR}/docker-compose.jitsi.yml" "${JITSI_DIR}/"
ok "Jitsi .env written"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 8/10 — nginx"
cp "${APP_DIR}/deploy/nginx-all.conf" /etc/nginx/sites-available/dikly-all
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/dikly
rm -f /etc/nginx/sites-enabled/jitsi
ln -sf /etc/nginx/sites-available/dikly-all /etc/nginx/sites-enabled/dikly-all

# Temporary HTTP-only config so certbot can issue the cert (no SSL yet)
cat > /etc/nginx/sites-available/dikly-temp << 'EOF'
server {
    listen 80;
    server_name dikly.live www.dikly.live app.dikly.live meet.dikly.live monitor.dikly.live api.dikly.live admin.dikly.live;
    root /var/www/html;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'DIKLY coming soon'; add_header Content-Type text/plain; }
}
EOF
rm -f /etc/nginx/sites-enabled/dikly-all
ln -sf /etc/nginx/sites-available/dikly-temp /etc/nginx/sites-enabled/dikly-temp
mkdir -p /var/www/certbot
nginx -t && systemctl reload nginx
ok "nginx temporary config active"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 9/10 — SSL certificates"

# Check DNS propagation
info "Checking DNS propagation…"
DNS_READY=true
for sub in "${SUBDOMAINS[@]}"; do
  RESOLVED=$(dig +short "$sub" @8.8.8.8 2>/dev/null | head -1)
  if [ "$RESOLVED" = "$VPS_IP" ]; then
    ok "  $sub → $RESOLVED"
  else
    warn "  $sub → '${RESOLVED:-not found}' (expected $VPS_IP)"
    DNS_READY=false
  fi
done

if [ "$DNS_READY" = "true" ]; then
  info "Getting SSL certificates…"
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "${ADMIN_EMAIL}" \
    -d dikly.live \
    -d www.dikly.live \
    -d app.dikly.live \
    -d meet.dikly.live \
    -d monitor.dikly.live \
    -d api.dikly.live \
    -d admin.dikly.live
  ok "SSL certificates issued"

  # Switch to full nginx config with SSL
  rm -f /etc/nginx/sites-enabled/dikly-temp
  ln -sf /etc/nginx/sites-available/dikly-all /etc/nginx/sites-enabled/dikly-all
  nginx -t && systemctl reload nginx
  ok "nginx full config with SSL active"
else
  warn "DNS not fully propagated yet — SSL skipped for now"
  warn "After DNS propagates, run:"
  warn "  certbot --nginx --non-interactive --agree-tos --email ${ADMIN_EMAIL} -d dikly.live -d www.dikly.live -d app.dikly.live -d meet.dikly.live -d monitor.dikly.live -d api.dikly.live -d admin.dikly.live"
  warn "Then: rm /etc/nginx/sites-enabled/dikly-temp && ln -s /etc/nginx/sites-available/dikly-all /etc/nginx/sites-enabled/dikly-all && nginx -t && systemctl reload nginx"
fi

# Set up auto-renewal
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -
ok "SSL auto-renewal scheduled (daily 3am)"

# ══════════════════════════════════════════════════════════════════════════════
header "Step 10/10 — Launch services"

# DIKLY app stack
info "Starting DIKLY app (backend + MongoDB + Redis)…"
cd "${APP_DIR}"
docker compose up -d
ok "DIKLY stack started"

# Jitsi stack
info "Starting Jitsi stack…"
cd "${JITSI_DIR}"
docker compose -f docker-compose.jitsi.yml up -d
ok "Jitsi stack started"

# Wait for services
info "Waiting 15s for services to come up…"
sleep 15

# Health check
HEALTH=$(curl -sf http://localhost:5000/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"ok"'; then
  ok "DIKLY backend is healthy"
else
  warn "DIKLY backend health check pending (may still be starting)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  DIKLY deployment complete!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Your sites:${NC}"
echo "  🌐  https://dikly.live              — Main site"
echo "  📚  https://app.dikly.live           — Student / Lecturer dashboard"
echo "  🎥  https://meet.dikly.live          — Jitsi meetings"
echo "  👁   https://monitor.dikly.live/monitor — Live proctoring dashboard"
echo "  🔌  https://api.dikly.live/api       — API status"
echo "  ⚙   https://admin.dikly.live         — Admin panel"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo "  docker compose -C ${APP_DIR} logs -f app          # DIKLY logs"
echo "  docker compose -C ${APP_DIR} restart app          # Restart after .env change"
echo "  docker compose -C ${JITSI_DIR} -f docker-compose.jitsi.yml logs -f  # Jitsi logs"
echo "  docker ps                                          # All running containers"
echo ""
echo -e "${BOLD}Secrets saved to:${NC}"
echo "  ${APP_DIR}/.env       (DIKLY + Jitsi secrets)"
echo "  ${JITSI_DIR}/.env     (Jitsi stack)"
echo ""

if [ "$DNS_READY" != "true" ]; then
  echo -e "${YELLOW}${BOLD}⚠  DNS was not propagated when this ran.${NC}"
  echo -e "   Once DNS resolves, run this to get SSL:"
  echo ""
  echo "   certbot --nginx --non-interactive --agree-tos --email ${ADMIN_EMAIL} \\"
  echo "     -d dikly.live -d www.dikly.live -d app.dikly.live \\"
  echo "     -d meet.dikly.live -d monitor.dikly.live -d api.dikly.live -d admin.dikly.live"
  echo ""
  echo "   Then switch to full nginx config:"
  echo "   rm /etc/nginx/sites-enabled/dikly-temp"
  echo "   ln -s /etc/nginx/sites-available/dikly-all /etc/nginx/sites-enabled/dikly-all"
  echo "   nginx -t && systemctl reload nginx"
  echo ""
fi

echo -e "${BOLD}Next steps:${NC}"
echo "  1. Add Namecheap DNS A records (if not done) — see table above"
echo "  2. Update .env with real PAYSTACK_SECRET_KEY when ready"
echo "  3. Update .env with GMAIL_APP_PASSWORD for email notifications"
echo "  4. Visit https://dikly.live to confirm everything works"
echo ""
