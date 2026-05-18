#!/usr/bin/env bash
# DIKLY Jitsi Infrastructure Diagnostics
# Run on the server: bash deploy/jitsi-diagnostics.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${JITSI_DOMAIN:-meet.dikly.live}"
APP_ID="${JITSI_APP_ID:-dikly}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; ERRORS=$((ERRORS+1)); }
warn() { echo -e "${YELLOW}!${NC} $*"; }
ERRORS=0

echo "═══════════════════════════════════════════"
echo " DIKLY Jitsi Diagnostics — $DOMAIN"
echo "═══════════════════════════════════════════"

# ── 1. Container status ───────────────────────────────────────────────────────
echo ""
echo "── 1. Container Status ──"
for SVC in web prosody jicofo jvb; do
  STATUS=$(docker compose -f "$(dirname "$0")/../docker-compose.jitsi.yml" ps --format json 2>/dev/null \
    | python3 -c "import sys,json; data=json.load(sys.stdin); [print(s.get('State','?')) for s in (data if isinstance(data,list) else [data]) if '$SVC' in s.get('Service','')]" 2>/dev/null || echo "unknown")
  if [[ "$STATUS" == *"running"* ]]; then
    ok "jitsi-$SVC: running"
  else
    fail "jitsi-$SVC: $STATUS (expected: running)"
  fi
done

# ── 2. Required env vars ──────────────────────────────────────────────────────
echo ""
echo "── 2. Environment Variables ──"
for VAR in JITSI_DOMAIN JITSI_APP_ID JITSI_APP_SECRET JVB_ADVERTISE_IPS; do
  if [[ -n "${!VAR:-}" ]]; then
    if [[ "$VAR" == *SECRET* || "$VAR" == *PASSWORD* ]]; then
      ok "$VAR: set (hidden)"
    else
      ok "$VAR: ${!VAR}"
    fi
  else
    fail "$VAR: NOT SET"
  fi
done

# ── 3. DNS resolution ─────────────────────────────────────────────────────────
echo ""
echo "── 3. DNS Resolution ──"
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
if [[ -n "$RESOLVED_IP" ]]; then
  ok "$DOMAIN → $RESOLVED_IP"
  SERVER_IP=$(curl -sf https://api.ipify.org 2>/dev/null || echo "unknown")
  if [[ "$RESOLVED_IP" == "$SERVER_IP" ]]; then
    ok "DNS matches server public IP ($SERVER_IP)"
  else
    warn "DNS $RESOLVED_IP may not match server IP $SERVER_IP"
  fi
else
  fail "$DOMAIN: DNS not resolving"
fi

# ── 4. SSL certificate ────────────────────────────────────────────────────────
echo ""
echo "── 4. SSL Certificate ──"
CERT_EXPIRY=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")
if [[ -n "$CERT_EXPIRY" ]]; then
  ok "TLS cert valid — expires: $CERT_EXPIRY"
else
  fail "TLS cert check failed for $DOMAIN:443"
fi

# ── 5. HTTP endpoints ─────────────────────────────────────────────────────────
echo ""
echo "── 5. HTTP Endpoints ──"

# BOSH
BOSH_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "https://$DOMAIN/http-bind" 2>/dev/null || echo "0")
if [[ "$BOSH_CODE" =~ ^(200|400)$ ]]; then
  ok "BOSH /http-bind: HTTP $BOSH_CODE (healthy)"
else
  fail "BOSH /http-bind: HTTP $BOSH_CODE (expected 200 or 400)"
fi

# WebSocket upgrade test (checks nginx routes it)
WS_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" -H "Connection: upgrade" \
  "https://$DOMAIN/xmpp-websocket" 2>/dev/null || echo "0")
if [[ "$WS_CODE" =~ ^(101|200|400|426)$ ]]; then
  ok "XMPP WebSocket /xmpp-websocket: HTTP $WS_CODE (route reachable)"
else
  fail "XMPP WebSocket /xmpp-websocket: HTTP $WS_CODE"
fi

# Jitsi web frontend
WEB_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "https://$DOMAIN/" 2>/dev/null || echo "0")
if [[ "$WEB_CODE" == "200" ]]; then
  ok "Jitsi web frontend: HTTP 200"
else
  fail "Jitsi web frontend: HTTP $WEB_CODE"
fi

# external_api.js
API_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "https://$DOMAIN/external_api.js" 2>/dev/null || echo "0")
if [[ "$API_CODE" == "200" ]]; then
  ok "external_api.js: HTTP 200"
else
  fail "external_api.js: HTTP $API_CODE"
fi

# ── 6. Port accessibility ─────────────────────────────────────────────────────
echo ""
echo "── 6. Ports ──"

# UDP 10000 (JVB media) — test with nc
if command -v nc &>/dev/null; then
  if nc -zu -w2 "$DOMAIN" 10000 2>/dev/null; then
    ok "UDP 10000 (JVB RTP): reachable"
  else
    warn "UDP 10000 (JVB RTP): could not verify (may still work — UDP unreachable from this host)"
  fi
else
  warn "UDP 10000: nc not available, skipping"
fi

# TCP 4443 (JVB TCP fallback)
if nc -zw2 "$DOMAIN" 4443 2>/dev/null; then
  ok "TCP 4443 (JVB TCP fallback): open"
else
  fail "TCP 4443 (JVB TCP fallback): CLOSED — mobile/restricted networks will fail"
fi

# ── 7. Jicofo REST ────────────────────────────────────────────────────────────
echo ""
echo "── 7. Jicofo REST API ──"
JICOFO_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "http://127.0.0.1:8888/about/health" 2>/dev/null || echo "0")
if [[ "$JICOFO_CODE" == "200" ]]; then
  ok "Jicofo REST: healthy"
else
  fail "Jicofo REST: HTTP $JICOFO_CODE (expected 200)"
fi

# ── 8. JWT test token ─────────────────────────────────────────────────────────
echo ""
echo "── 8. JWT Token Validation ──"
if command -v node &>/dev/null && [[ -n "${JITSI_APP_SECRET:-}" ]]; then
  TOKEN=$(node -e "
    const jwt = require('jsonwebtoken');
    const now = Math.floor(Date.now()/1000);
    const payload = {
      iss: '${APP_ID}', sub: '${DOMAIN}', aud: '${APP_ID}',
      room: 'test', exp: now+60, nbf: now-10,
      context: { user: { id: 'diag', name: 'Diagnostics', email: '', moderator: false } }
    };
    const tok = jwt.sign(payload, process.env.JITSI_APP_SECRET, { algorithm: 'HS256', header: { kid: '${APP_ID}', alg: 'HS256' } });
    const decoded = jwt.verify(tok, process.env.JITSI_APP_SECRET);
    console.log('OK iss=' + decoded.iss + ' sub=' + decoded.sub + ' aud=' + decoded.aud);
  " 2>/dev/null || echo "FAIL")
  if [[ "$TOKEN" == OK* ]]; then
    ok "JWT sign+verify: $TOKEN"
  else
    fail "JWT sign+verify failed — check JITSI_APP_SECRET"
  fi
else
  warn "JWT test skipped (node not available or JITSI_APP_SECRET not set)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}All checks passed — Jitsi infrastructure healthy${NC}"
else
  echo -e "${RED}$ERRORS check(s) failed — review output above${NC}"
  echo ""
  echo "Common fixes:"
  echo "  JVB media unreachable: ensure UDP 10000 and TCP 4443 are open in firewall"
  echo "  JVB_ADVERTISE_IPS not set: add to .env and restart jvb container"
  echo "  BOSH/WS failing: docker compose -f docker-compose.jitsi.yml restart web prosody"
  echo "  JWT errors: verify JITSI_APP_SECRET matches JWT_APP_SECRET in Jitsi .env"
fi
echo "═══════════════════════════════════════════"
exit $ERRORS
