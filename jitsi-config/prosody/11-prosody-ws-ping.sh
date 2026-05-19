#!/bin/sh
# Runs after Prosody config is generated, before Prosody starts.
# Adds websocket_ping_interval to every VirtualHost block so Prosody
# sends WebSocket ping frames every 25 seconds — this keeps carrier NAT
# entries alive on LTE without needing any client-side BOSH config.
set -e

# Try conf.avail first (some builds), fall back to conf.d
if [ -d /config/conf.avail ]; then
  CFG_DIR=/config/conf.avail
elif [ -d /config/conf.d ]; then
  CFG_DIR=/config/conf.d
else
  echo "[prosody-ws-ping] no conf dir found, skipping"
  exit 0
fi
echo "[prosody-ws-ping] scanning ${CFG_DIR}"

for f in "${CFG_DIR}"/*.cfg.lua; do
  [ -f "$f" ] || continue
  if grep -q "websocket_ping_interval" "$f"; then
    echo "[prosody-ws-ping] already patched: $f"
    continue
  fi
  # Insert websocket_ping_interval after the first VirtualHost line
  sed -i '/^VirtualHost/a\  websocket_ping_interval = 25;' "$f"
  echo "[prosody-ws-ping] patched $f → websocket_ping_interval=25"
done
