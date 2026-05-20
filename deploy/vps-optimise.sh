#!/bin/bash
# One-time VPS system tuning for DIKLY + Jitsi.
# Run once as root after initial server setup:
#   bash /root/KODEX/deploy/vps-optimise.sh
#
# Safe to re-run — all sysctl writes are idempotent.
set -euo pipefail

log() { echo "[vps-optimise] $*"; }

# ── Kernel network tuning ─────────────────────────────────────────────────────
# Large UDP send/recv buffers prevent packet loss under sustained JVB media load.
# RTP at 1 Mbps ≈ 125 KB/s per participant; 16 MB buffer ≈ 128s at 1 Mbps/each.
# rmem_max / wmem_max: per-socket hard cap
# net.core.rmem_default / wmem_default: per-socket default (before SO_RCVBUF)
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.core.rmem_default=1048576
sysctl -w net.core.wmem_default=1048576
sysctl -w net.core.netdev_max_backlog=5000

# TCP tuning — improves throughput on high-latency links (mobile ↔ server)
sysctl -w net.ipv4.tcp_rmem='4096 87380 16777216'
sysctl -w net.ipv4.tcp_wmem='4096 65536 16777216'
sysctl -w net.ipv4.tcp_slow_start_after_idle=0

# Connection tracking — Docker + coturn relay open many short-lived UDP flows.
# Default nf_conntrack_max is often 65536; bump to prevent table exhaustion.
if modprobe nf_conntrack 2>/dev/null; then
    sysctl -w net.netfilter.nf_conntrack_max=262144
    sysctl -w net.netfilter.nf_conntrack_udp_timeout=30
    sysctl -w net.netfilter.nf_conntrack_udp_timeout_stream=120
fi

# Increase local port range for outbound connections (coturn relay allocations).
sysctl -w net.ipv4.ip_local_port_range='1024 65535'

# ── File descriptor limits ────────────────────────────────────────────────────
# JVB and coturn open one fd per participant media stream.
# 100k participants × 2 (send+recv) = 200k fds; 1M is a comfortable ceiling.
if ! grep -q '^\* soft nofile' /etc/security/limits.conf; then
    echo '* soft nofile 1048576' >> /etc/security/limits.conf
    echo '* hard nofile 1048576' >> /etc/security/limits.conf
    log "Added nofile limits to /etc/security/limits.conf"
fi

# Docker daemon ulimits — containers inherit the daemon's limits.
DOCKER_DAEMON_JSON=/etc/docker/daemon.json
if [ -f "$DOCKER_DAEMON_JSON" ]; then
    # Only patch if default-ulimits is absent; don't overwrite existing config.
    if ! grep -q 'default-ulimits' "$DOCKER_DAEMON_JSON"; then
        python3 -c "
import json, sys
with open('$DOCKER_DAEMON_JSON') as f:
    d = json.load(f)
d.setdefault('default-ulimits', {})['nofile'] = {'Name': 'nofile', 'Soft': 1048576, 'Hard': 1048576}
with open('$DOCKER_DAEMON_JSON', 'w') as f:
    json.dump(d, f, indent=2)
print('Patched daemon.json')
"
        systemctl reload docker || true
        log "Patched Docker daemon ulimits."
    else
        log "Docker daemon already has ulimits — skipping."
    fi
else
    # Create a minimal daemon.json
    printf '{\n  "default-ulimits": {\n    "nofile": {"Name": "nofile", "Soft": 1048576, "Hard": 1048576}\n  }\n}\n' \
        > "$DOCKER_DAEMON_JSON"
    systemctl reload docker || true
    log "Created Docker daemon.json with ulimits."
fi

# ── Persist sysctl settings across reboots ────────────────────────────────────
SYSCTL_FILE=/etc/sysctl.d/99-dikly-jitsi.conf
cat > "$SYSCTL_FILE" << 'EOF'
# DIKLY + Jitsi VPS tuning — managed by deploy/vps-optimise.sh
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.ip_local_port_range = 1024 65535
net.netfilter.nf_conntrack_max = 262144
net.netfilter.nf_conntrack_udp_timeout = 30
net.netfilter.nf_conntrack_udp_timeout_stream = 120
EOF
log "Wrote persistent sysctl settings to $SYSCTL_FILE"

log "VPS optimisation complete. Reboot not required — settings are live."
