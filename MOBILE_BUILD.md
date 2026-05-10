# DIKLY Mobile App — Build Guide

## Prerequisites
- Node.js 18+
- Android Studio (latest)
- Xcode 15+ (Mac only, for iOS)
- Java 17 (for Android builds)

## First-Time Setup

### 1. Install Capacitor
```bash
# From the KODEX root directory
cd /path/to/KODEX
npm install
```

### 2. Add Platforms
```bash
npx cap add android
npx cap add ios
npx cap sync
```

### 3. App Icons & Splash Screens
Use @capacitor/assets to generate all required sizes:
```bash
npm install -g @capacitor/assets
# Place your 1024x1024 icon.png and 2732x2732 splash.png in:
# /KODEX/assets/icon.png
# /KODEX/assets/splash.png
npx capacitor-assets generate
```

## Android Build (Google Play Store)

### Generate Keystore (one-time only)
```bash
keytool -genkey -v -keystore dikly-release.jks -alias dikly -keyalg RSA -keysize 2048 -validity 10000
```
⚠️ Save the keystore file and passwords SECURELY. You cannot re-upload to Play Store without it.

### Create keystore.properties (at KODEX root, never commit this!)
```
storeFile=../../dikly-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=dikly
keyPassword=YOUR_KEY_PASSWORD
```

### Configure android/app/build.gradle
After running `npx cap add android`, edit `android/app/build.gradle`:

Find the `android {}` block and add BEFORE `buildTypes`:
```groovy
signingConfigs {
    release {
        def keystorePropertiesFile = rootProject.file("../../keystore.properties")
        def keystoreProperties = new Properties()
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}
```

Then update `buildTypes.release`:
```groovy
release {
    signingConfig signingConfigs.release
    minifyEnabled false
    proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
}
```

### Generate AAB
```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### Get SHA-256 Fingerprint (for App Links)
```bash
keytool -list -v -keystore dikly-release.jks -alias dikly
# Copy the SHA256 fingerprint and set ANDROID_SHA256_FINGERPRINT env var on Render
```

## iOS Build (App Store)

### Open in Xcode
```bash
npx cap open ios
```

### In Xcode:
1. Select your Team under Signing & Capabilities
2. Set Bundle Identifier: `sbs.dikly.attendance`
3. Set Version: 1.0.0, Build: 1
4. Product → Archive
5. Upload to App Store Connect

### Required iOS Permissions (already in Info.plist after cap add ios):
- Camera: "DIKLY uses your camera for attendance verification and proctored assessments"
- Microphone: "DIKLY uses microphone during video meetings"

## Environment Variables (Render)
Add to your Render service:
```
ANDROID_SHA256_FINGERPRINT=AA:BB:CC:... (from keytool output)
APPLE_TEAM_ID=XXXXXXXXXX (from Apple Developer account)
```

## Updating the App
After any changes to dikly.sbs:
```bash
npx cap sync
```
Then rebuild in Android Studio / Xcode.
