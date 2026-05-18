#!/usr/bin/env bash
# DIKLY Jitsi Server Fix
# Fixes the three most common causes of "You have been disconnected" on mobile.
#
# Run from the KODEX repo root on your Jitsi VPS:
#   cd ~/KODEX && git pull && bash deploy/server-fix.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.jitsi.yml"
ENV_FILE="$REPO_ROOT/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
fail() { echo -e "  ${RED}✗${NC} $*"; ERRORS=$((ERRORS+1)); }
warn() { echo -e "  ${YELLOW}!${NC} $*"; }
ERRORS=0

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD} DIKLY Jitsi Server Fix${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"

# ── 1. Firewall ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── 1. Firewall Ports ──${NC}"

if command -v ufw &>/dev/null; then
  # These ports MUST be reachable from the internet for meetings to work on mobile:
  #   443/tcp   – HTTPS (nginx, Jitsi web UI + WebSocket)
  #   10000/udp – JVB RTP media (primary, fast path)
  #   4443/tcp  – JVB RTP media (TCP fallback — REQUIRED for mobile/LTE)
  for RULE in "443/tcp" "10000/udp" "4443/tcp"; do
    if ufw allow "$RULE" 2>&1 | grep -qiE "updated|added|existing"; then
      ok "ufw: allowed $RULE"
    else
      ok "ufw: $RULE already open"
    fi
  done
  ufw --force reload >/dev/null 2>&1 && ok "ufw reloaded"
  echo ""
  echo "  Current relevant rules:"
  ufw status | grep -E '443|10000|4443' | sed 's/^/    /' || true
elif command -v iptables &>/dev/null; then
  warn "ufw not found — opening via iptables"
  iptables -I INPUT -p udp --dport 10000 -j ACCEPT 2>/dev/null && ok "iptables: 10000/udp opened" || true
  iptables -I INPUT -p tcp --dport 4443  -j ACCEPT 2>/dev/null && ok "iptables: 4443/tcp opened"  || true
  iptables -I INPUT -p tcp --dport 443   -j ACCEPT 2>/dev/null && ok "iptables: 443/tcp opened"   || true
else
  warn "No firewall tool found (ufw/iptables). Ensure ports 443/tcp, 10000/udp, 4443/tcp are open in your cloud provider's panel."
fi

# ── 2. Check .env file ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}── 2. Environment File ──${NC}"

if [[ ! -f "$ENV_FILE" ]]; then
  fail ".env not found at $ENV_FILE"
  echo ""
  echo -e "  ${YELLOW}Create it:${NC}  cp $REPO_ROOT/deploy/jitsi.env.example $ENV_FILE"
  echo "  Then fill in the values and re-run this script."
  exit 1
fi

ok ".env found: $ENV_FILE"
ALL_VARS_OK=true
for VAR in JITSI_DOMAIN JITSI_APP_ID JITSI_APP_SECRET JVB_ADVERTISE_IPS JICOFO_AUTH_PASSWORD JICOFO_COMPONENT_SECRET JVB_AUTH_PASSWORD; do
  VALUE=$(grep "^${VAR}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || echo "")
  if [[ -z "$VALUE" || "$VALUE" == *"REPLACE"* ]]; then
    fail "$VAR: NOT SET or still placeholder — edit $ENV_FILE"
    ALL_VARS_OK=false
  else
    if [[ "$VAR" == *SECRET* || "$VAR" == *PASSWORD* ]]; then
      ok "$VAR: set (${#VALUE} chars)"
    else
      ok "$VAR: $VALUE"
    fi
  fi
done

if [[ "$ALL_VARS_OK" == false ]]; then
  echo ""
  echo -e "  ${RED}Fix the missing env vars above, then re-run this script.${NC}"
  exit 1
fi

# ── 3. Check JVB_ADVERTISE_IPS matches actual public IP ──────────────────────
echo ""
echo -e "${BOLD}── 3. JVB Public IP ──${NC}"

JVB_IP=$(grep "^JVB_ADVERTISE_IPS=" "$ENV_FILE" | cut -d= -f2-)
ACTUAL_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || echo "unknown")
if [[ "$JVB_IP" == "$ACTUAL_IP" ]]; then
  ok "JVB_ADVERTISE_IPS ($JVB_IP) matches server public IP"
else
  fail "JVB_ADVERTISE_IPS=$JVB_IP but server public IP is $ACTUAL_IP"
  echo ""
  echo -e "  ${YELLOW}Fix:${NC} update JVB_ADVERTISE_IPS in $ENV_FILE to $ACTUAL_IP"
  sed -i "s|^JVB_ADVERTISE_IPS=.*|JVB_ADVERTISE_IPS=${ACTUAL_IP}|" "$ENV_FILE"
  ok "Auto-corrected JVB_ADVERTISE_IPS to $ACTUAL_IP in $ENV_FILE"
fi

# ── 4. Restart the Jitsi stack ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}── 4. Restart Jitsi Stack ──${NC}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  fail "docker-compose.jitsi.yml not found at $COMPOSE_FILE"
  exit 1
fi

echo "  Pulling latest images…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --quiet 2>&1 | tail -5 | sed 's/^/  /'

echo "  Stopping stack…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans 2>&1 | tail -3 | sed 's/^/  /'

echo "  Starting stack…"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d 2>&1 | tail -5 | sed 's/^/  /'
ok "Stack started"

# ── 5. Wait for startup then run diagnostics ─────────────────────────────────
echo ""
echo -e "${BOLD}── 5. Health Check ──${NC}"
echo "  Waiting 20s for containers to initialise…"
sleep 20

# Show recent Prosody logs — JWT auth errors appear here
echo ""
echo "  Recent Prosody log (JWT/auth errors show here):"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs prosody --tail=20 2>/dev/null \
  | grep -iE "error|jwt|auth|warn|fail|disconnect" \
  | sed 's/^/    /' || echo "    (no matching log lines)"

# Show recent JVB logs — ICE/media errors appear here
echo ""
echo "  Recent JVB log (ICE/media errors show here):"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs jvb --tail=20 2>/dev/null \
  | grep -iE "error|ice|failed|warn|advertis" \
  | sed 's/^/    /' || echo "    (no matching log lines)"

echo ""
echo -e "${BOLD}── 6. Full Diagnostics ──${NC}"
if [[ -f "$REPO_ROOT/deploy/jitsi-diagnostics.sh" ]]; then
  bash "$REPO_ROOT/deploy/jitsi-diagnostics.sh" || true
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All checks passed — Jitsi should be working.${NC}"
  echo ""
  echo "  Try joining a meeting now. If you still get disconnected:"
  echo "  1. Check that JITSI_APP_SECRET in this .env matches exactly what"
  echo "     is set in your Render env vars for the DIKLY API."
  echo "  2. Run: docker compose -f docker-compose.jitsi.yml logs prosody --follow"
  echo "     and look for JWT errors when someone tries to join."
else
  echo -e "${RED}${BOLD}$ERRORS issue(s) found — see above.${NC}"
fi
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""
