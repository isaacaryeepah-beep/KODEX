#!/bin/sh
# Runs after Prosody config is generated, before Prosody starts.
# Adds websocket_ping_interval to every VirtualHost block so Prosody
# sends WebSocket ping frames every 25 seconds — this keeps carrier NAT
# entries alive on LTE without needing any client-side BOSH config.
set -e

CFG_DIR=/config/conf.avail
if [ ! -d "${CFG_DIR}" ]; then
  echo "[prosody-ws-ping] no conf.avail dir, skipping"
  exit 0
fi

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
