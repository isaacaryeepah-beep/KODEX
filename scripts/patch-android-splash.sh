#!/bin/bash
# patch-android-splash.sh
# Run from the KODEX root directory: bash scripts/patch-android-splash.sh
#
# Local-dev mirror of the "Patch Android splash screen" step in
# .github/workflows/build-android.yml — keep the two in sync. Replaces the
# white Capacitor launch screen with a dark (#080F20) background and the
# Dikly mark centered on top, on both pre-Android-12 and Android 12+
# devices. Requires ic_splash.png to already exist (run
# `python3 scripts/gen_icons.py` first, or `npx cap add android` +
# gen_icons.py if the android/ project doesn't exist yet).

set -e

ANDROID="android"

if [ ! -d "$ANDROID" ]; then
  echo "ERROR: Android project not found at ./$ANDROID"
  echo "Run 'npx cap add android' first, then re-run this script."
  exit 1
fi

DRAWABLE="$ANDROID/app/src/main/res/drawable"
VALUES="$ANDROID/app/src/main/res/values"
VALUES_V31="$ANDROID/app/src/main/res/values-v31"

mkdir -p "$DRAWABLE" "$VALUES" "$VALUES_V31"

if [ ! -f "$DRAWABLE/ic_splash.png" ]; then
  echo "ERROR: $DRAWABLE/ic_splash.png not found — run scripts/gen_icons.py first."
  exit 1
fi

# `npx cap add android` scaffolds its own default white splash.png under
# drawable/ AND under orientation+density-qualified folders (drawable-
# port-xhdpi, drawable-land-xxxhdpi, etc). The base one collides with
# splash.xml below (AAPT duplicate-resource build error); the qualified
# ones don't collide but DO win resource resolution over splash.xml on
# real devices, silently overriding this whole fix. Delete all of them.
find "$ANDROID/app/src/main/res" -iname 'splash.png' -delete

# ── 1. Replace splash.xml with dark background + centered Dikly mark ──────────
cat > "$DRAWABLE/splash.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="#080F20"/></item>
    <item>
        <bitmap
            android:src="@drawable/ic_splash"
            android:gravity="center" />
    </item>
</layer-list>
EOF
echo "✓ drawable/splash.xml  →  dark background + centered ic_splash icon"

# ── 2. Patch styles.xml — dark launch window background, pre-Android-12 ───────
STYLES="$VALUES/styles.xml"
if [ -f "$STYLES" ]; then
  cp "$STYLES" "${STYLES}.bak"
  sed -i 's/parent="Theme\.SplashScreen"/parent="AppTheme.NoActionBar"/g' "$STYLES"
  python3 - << 'PYEOF'
import re
with open('android/app/src/main/res/values/styles.xml') as f:
    s = f.read()
if 'NoActionBarLaunch' in s and 'android:background' not in s:
    s = re.sub(
        r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)',
        r'\1\n        <item name="android:background">#080F20</item>',
        s
    )
with open('android/app/src/main/res/values/styles.xml', 'w') as f:
    f.write(s)
PYEOF
  echo "✓ values/styles.xml   →  windowBackground = #080F20  (backup: styles.xml.bak)"
else
  echo "⚠  values/styles.xml not found — skipping (create the Android project first)"
fi

# ── 3. Android 12+ system splash screen config ────────────────────────────────
cat > "$VALUES_V31/styles.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:windowSplashScreenBackground">#080F20</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/ic_splash</item>
        <item name="android:windowSplashScreenIconBackgroundColor">#080F20</item>
    </style>
</resources>
EOF
echo "✓ values-v31/styles.xml  →  Android 12+ splash = dark background + Dikly icon"

echo ""
echo "Done. Now rebuild the APK:"
echo "  Android Studio → Build → Generate Signed Bundle / APK"
echo ""
echo "The white Capacitor screen will no longer appear."
