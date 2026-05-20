#!/bin/sh
# Configure Prosody BOSH for LTE resilience.
# bosh_default_wait=30: server holds each BOSH long-poll ≤30s instead of the
# default 60s, so carrier NAT (which kills idle HTTP after ~60s) can never
# terminate a live poll. bosh_max_inactivity=60 gives the client 60s to resend
# a new poll before the session expires.
set -e
PROSODY_CFG=/config/prosody.cfg.lua
[ -f "${PROSODY_CFG}" ] || { echo "[prosody-bosh] no config found, skipping"; exit 0; }

grep -q 'bosh_default_wait' "${PROSODY_CFG}" && {
  echo "[prosody-bosh] already configured, skipping"
  exit 0
}

cat >> "${PROSODY_CFG}" << 'EOF'

-- BOSH LTE keepalive: limit poll hold to 30s so carrier NAT cannot kill it.
bosh_default_wait = 30
bosh_max_inactivity = 60
EOF

echo "[prosody-bosh] bosh_default_wait=30 bosh_max_inactivity=60"
