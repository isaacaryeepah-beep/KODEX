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

# Play Core (referenced by Flutter deferred components, not used in direct APK builds)
-dontwarn com.google.android.play.core.**
-keep class com.google.android.play.core.** { *; }
