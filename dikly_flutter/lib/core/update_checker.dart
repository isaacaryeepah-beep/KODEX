import 'package:dio/dio.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class UpdateChecker {
  static const _apiUrl =
      'https://api.github.com/repos/isaacaryeepah-beep/Dikly_releases/releases/tags/flutter-latest';
  static const _seenKey = 'update_seen_release_id';

  static Future<UpdateInfo?> check() async {
    try {
      final resp = await Dio().get<Map<String, dynamic>>(
        _apiUrl,
        options: Options(
          headers: {'Accept': 'application/vnd.github.v3+json'},
          receiveTimeout: const Duration(seconds: 8),
          sendTimeout: const Duration(seconds: 5),
        ),
      );
      final data = resp.data;
      if (data == null) return null;

      final releaseId = data['id'] as int? ?? 0;
      final prefs = await SharedPreferences.getInstance();
      final seenId = prefs.getInt(_seenKey) ?? 0;
      if (releaseId <= seenId) return null;

      final assets = (data['assets'] as List<dynamic>? ?? []);
      final apk = assets.firstWhere(
        (a) => (a['name'] as String? ?? '').endsWith('.apk'),
        orElse: () => null,
      );
      final downloadUrl = apk != null
          ? apk['browser_download_url'] as String
          : data['html_url'] as String;

      return UpdateInfo(releaseId: releaseId, downloadUrl: downloadUrl);
    } catch (_) {
      return null;
    }
  }

  /// Downloads the APK and opens the system installer.
  /// [onProgress] receives values 0.0–1.0.
  static Future<void> downloadAndInstall(
    UpdateInfo update, {
    void Function(double)? onProgress,
  }) async {
    final dir = await getTemporaryDirectory();
    final apkPath = '${dir.path}/dikly-update.apk';

    await Dio().download(
      update.downloadUrl,
      apkPath,
      onReceiveProgress: (received, total) {
        if (total > 0) onProgress?.call(received / total);
      },
    );

    await OpenFile.open(apkPath);
    await markSeen(update.releaseId);
  }

  static Future<void> markSeen(int releaseId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_seenKey, releaseId);
  }
}

class UpdateInfo {
  final int releaseId;
  final String downloadUrl;

  const UpdateInfo({required this.releaseId, required this.downloadUrl});
}
