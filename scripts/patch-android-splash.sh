#!/bin/bash
# patch-android-splash.sh
# Run from the KODEX root directory: bash scripts/patch-android-splash.sh
#
# Replaces the white Capacitor launch screen with a seamless dark (#080F20)
# screen on both pre-Android 12 and Android 12+ devices.

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

# ── 1. Replace splash.xml with a plain dark background (no icon) ──────────────
cat > "$DRAWABLE/splash.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="#080F20"/></item>
</layer-list>
EOF
echo "✓ drawable/splash.xml  →  plain dark background"

# Remove any old splash.png — it overrides splash.xml if both exist
if [ -f "$DRAWABLE/splash.png" ]; then
  rm "$DRAWABLE/splash.png"
  echo "✓ Removed old splash.png"
fi

# ── 2. Patch styles.xml — make the launch window background dark ──────────────
STYLES="$VALUES/styles.xml"
if [ -f "$STYLES" ]; then
  cp "$STYLES" "${STYLES}.bak"
  # Replace @drawable/splash references with a plain dark color
  sed -i \
    -e 's|android:background">@drawable/splash|android:background">#080F20|g' \
    -e 's|android:windowBackground">@drawable/splash|android:windowBackground">#080F20|g' \
    "$STYLES"
  echo "✓ values/styles.xml   →  windowBackground = #080F20  (backup: styles.xml.bak)"
else
  echo "⚠  values/styles.xml not found — skipping (create the Android project first)"
fi

# ── 3. Android 12+ system splash screen config ────────────────────────────────
# Creates a minimal splash_icon.xml (solid dark square) so no icon appears.
cat > "$DRAWABLE/splash_icon.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#080F20"/>
    <size android:width="108dp" android:height="108dp"/>
</shape>
EOF
echo "✓ drawable/splash_icon.xml  →  invisible icon placeholder"

cat > "$VALUES_V31/themes.xml" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Android 12+ splash screen: dark background, no visible icon -->
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:windowSplashScreenBackground">#080F20</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>
    </style>
</resources>
EOF
echo "✓ values-v31/themes.xml  →  Android 12+ splash = dark, no icon"

echo ""
echo "Done. Now rebuild the APK:"
echo "  Android Studio → Build → Generate Signed Bundle / APK"
echo ""
echo "The white Capacitor screen will no longer appear."
