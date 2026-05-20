#!/bin/sh
# Runs before the JVB service starts (s6 cont-init.d runs alphabetically).
# Patches the actual JVB launch script to cap JVM heap at 1500m.
#
# Why: heap is set inside jvb.sh, not the s6 run script.
# The s6 run script overwrites JAVA_SYS_PROPS with -D flags only,
# so passing -Xmx via env vars has no effect in this image version.
set -e

JVB_SH=/usr/share/jitsi-videobridge/jvb.sh
[ -f "${JVB_SH}" ] || { echo "[jvb-jvm-patch] jvb.sh not found, skipping"; exit 0; }

# Match -Xmx followed by anything up to the next space (handles both
# literal numbers like -Xmx3072m and variable refs like -Xmx${VAR:-3072}m)
sed -i 's/-Xmx[^ ]*/-Xmx1500m/g' "${JVB_SH}"
sed -i 's/-Xms[^ ]*/-Xms256m/g'  "${JVB_SH}"

echo "[jvb-jvm-patch] patched jvb.sh: -Xmx1500m -Xms256m"
