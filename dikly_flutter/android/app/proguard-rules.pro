# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Dio / OkHttp
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Flutter Secure Storage
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Keep model classes
-keep class com.dikly.app.** { *; }

# Google Play Core (used by Flutter deferred components — suppress R8 missing class warnings)
-dontwarn com.google.android.play.core.**
-keep class com.google.android.play.core.** { *; }

# Suppress other common missing class warnings
-dontwarn androidx.window.extensions.**
-dontwarn androidx.window.sidecar.**
