#!/bin/sh
# Runs before the JVB service starts (s6 cont-init.d runs alphabetically).
# Patches the JVB service run script to cap JVM heap at 1500m.
#
# Why: jitsi/jvb:stable-9584 hardcodes -Xmx3072m in /etc/services.d/jvb/run.
# Neither JAVA_SYS_PROPS nor JVB_JAVA_XMX override it in this image version.
# Patching the run script directly is the only reliable approach.
set -e

RUN_SCRIPT=/etc/services.d/jvb/run
[ -f "${RUN_SCRIPT}" ] || { echo "[jvb-jvm-patch] run script not found, skipping"; exit 0; }

sed -i 's/-Xmx[0-9]*m/-Xmx1500m/g' "${RUN_SCRIPT}"
sed -i 's/-Xms[0-9]*m/-Xms256m/g'  "${RUN_SCRIPT}"

echo "[jvb-jvm-patch] patched JVM heap: -Xmx1500m -Xms256m"
