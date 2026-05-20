#!/bin/sh
# Runs after 10-config generates /config/jvb.conf, before JVB process starts.
# Fixes three values the init script gets wrong regardless of env var settings.
set -e
JVB_CONF=/config/jvb.conf
[ -f "${JVB_CONF}" ] || { echo "[jvb-patch] no config found, skipping"; exit 0; }

# Enable Colibri WebSocket (generated as false — causes black screen)
awk '
  /websockets \{/ { in_ws=1 }
  in_ws && /enabled = false/ { sub("enabled = false", "enabled = true") }
  /\}/ && in_ws { in_ws=0 }
  { print }
' "${JVB_CONF}" > "${JVB_CONF}.tmp" && mv "${JVB_CONF}.tmp" "${JVB_CONF}"

# Stable server-id — init uses container IP which changes on every restart,
# making the Colibri WebSocket URL invalid after any container recycle.
sed -i 's/server-id = "[^"]*"/server-id = "default-id"/' "${JVB_CONF}"

# Don't advertise unreachable private Docker IPs as ICE candidates.
# JVB already has a static public-IP mapping; private candidates waste
# ICE gathering time on mobile before TURN fallback kicks in.
sed -i 's/advertise-private-candidates = true/advertise-private-candidates = false/' "${JVB_CONF}"

echo "[jvb-patch] websockets.enabled=true  server-id=default-id  no-private-candidates"
