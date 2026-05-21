#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  KODEX — LiveKit Self-Hosted Setup Script
#  Run this on your Contabo VPS as root:
#    sudo bash setup-livekit.sh
# ═══════════════════════════════════════════════════════════════
set -e

DOMAIN="meet.dikly.live"
LIVEKIT_PORT=7880
LIVEKIT_TCP_PORT=7881
RTC_PORT_START=50000
RTC_PORT_END=60000
CONFIG_DIR="/etc/livekit"
SERVICE_FILE="/etc/systemd/system/livekit.service"

# ── Colours ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

# ── Root check ───────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Please run as root: sudo bash $0"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "   KODEX LiveKit Setup — $DOMAIN"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Generate API key & secret ────────────────────────────────────
API_KEY="dikly-$(openssl rand -hex 8)"
API_SECRET="$(openssl rand -hex 32)"

info "Generated LiveKit credentials:"
echo "  API Key    : $API_KEY"
echo "  API Secret : $API_SECRET"
echo ""
warn "Save these — you will need them in your Render env vars."
echo ""

# ── 1. System update ─────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
success "System updated."

# ── 2. Install dependencies ──────────────────────────────────────
info "Installing dependencies..."
apt-get install -y -qq \
  curl wget gnupg2 \
  debian-keyring debian-archive-keyring apt-transport-https \
  ufw
success "Dependencies installed."

# ── 3. Configure firewall ────────────────────────────────────────
info "Configuring UFW firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow ${RTC_PORT_START}:${RTC_PORT_END}/udp
ufw --force enable
success "Firewall configured."

# ── 4. Install Caddy ─────────────────────────────────────────────
info "Installing Caddy web server..."
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  success "Caddy installed."
else
  success "Caddy already installed, skipping."
fi

# ── 5. Install LiveKit server ────────────────────────────────────
info "Installing LiveKit server..."
if ! command -v livekit-server &>/dev/null; then
  curl -sSL https://get.livekit.io | bash
  success "LiveKit server installed."
else
  CURRENT=$(livekit-server --version 2>&1 | head -1)
  success "LiveKit already installed: $CURRENT"
fi

# ── 6. Create LiveKit config ─────────────────────────────────────
info "Writing LiveKit config to $CONFIG_DIR/livekit.yaml ..."
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/livekit.yaml" <<YAML
port: ${LIVEKIT_PORT}

rtc:
  tcp_port: ${LIVEKIT_TCP_PORT}
  port_range_start: ${RTC_PORT_START}
  port_range_end: ${RTC_PORT_END}
  use_external_ip: true

keys:
  ${API_KEY}: ${API_SECRET}

logging:
  level: info
  pion_level: error

room:
  auto_create: true
  max_participants: 200
  empty_timeout: 300

webhook:
  api_key: ${API_KEY}
YAML
chmod 600 "$CONFIG_DIR/livekit.yaml"
success "LiveKit config written."

# ── 7. Create systemd service ────────────────────────────────────
info "Creating systemd service..."
cat > "$SERVICE_FILE" <<UNIT
[Unit]
Description=LiveKit SFU Server
Documentation=https://docs.livekit.io
After=network.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/livekit-server --config ${CONFIG_DIR}/livekit.yaml
Restart=always
RestartSec=5
User=root
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable livekit
systemctl start livekit
sleep 2

if systemctl is-active --quiet livekit; then
  success "LiveKit service is running."
else
  error "LiveKit service failed to start. Run: journalctl -u livekit -n 50"
fi

# ── 8. Configure Caddy ───────────────────────────────────────────
info "Writing Caddyfile for $DOMAIN ..."
cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
    reverse_proxy localhost:${LIVEKIT_PORT}
}
CADDY

systemctl restart caddy
sleep 3

if systemctl is-active --quiet caddy; then
  success "Caddy is running and will auto-provision SSL for $DOMAIN."
else
  warn "Caddy may still be starting. Check: systemctl status caddy"
fi

# ── 9. Final summary ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "  ${GREEN}LiveKit Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Domain    : $DOMAIN"
echo "  LiveKit   : wss://$DOMAIN  (after DNS propagates + SSL issues)"
echo ""
echo -e "  ${YELLOW}Add these to your Render environment variables:${NC}"
echo ""
echo "    LIVEKIT_URL=$( echo "wss://$DOMAIN" )"
echo "    LIVEKIT_API_KEY=$API_KEY"
echo "    LIVEKIT_API_SECRET=$API_SECRET"
echo ""
echo "  These are also saved to: $CONFIG_DIR/render-env.txt"
echo ""

# Save env vars to a file for easy copy-paste
cat > "$CONFIG_DIR/render-env.txt" <<ENV
# Add these to Render → Your Service → Environment → Add Env Var
LIVEKIT_URL=wss://${DOMAIN}
LIVEKIT_API_KEY=${API_KEY}
LIVEKIT_API_SECRET=${API_SECRET}
ENV
chmod 600 "$CONFIG_DIR/render-env.txt"

echo "  Before this works, make sure your DNS has:"
echo "    $DOMAIN  →  $(curl -s ifconfig.me 2>/dev/null || echo '<this-server-IP>')"
echo ""
echo "  Test the connection after DNS propagates:"
echo "    curl -I https://$DOMAIN"
echo ""
echo "═══════════════════════════════════════════════════════"
