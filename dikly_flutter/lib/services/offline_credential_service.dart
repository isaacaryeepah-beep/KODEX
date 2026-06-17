import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../core/api.dart';

/// Manages the 30-day offline attendance credential.
///
/// The credential is a signed HMAC token issued by the backend:
///   base64url(payload_json) + "." + hmac_sha256_hex
///
/// It is fetched once at login and stored securely, then automatically
/// sent to the ESP32 captive portal when the device joins a Dikly hotspot.
class OfflineCredentialService {
  static const _storage = FlutterSecureStorage();
  static const _credKey  = 'offline_credential';
  static const _expKey   = 'offline_credential_exp';

  /// Fetch a fresh credential from the backend and cache it.
  /// Returns null on failure (caller should retry later).
  static Future<String?> refresh() async {
    try {
      final resp = await apiService.get('/auth/offline-credential');
      final cred = resp['credential'] as String?;
      if (cred == null || cred.isEmpty) return null;

      // Parse expiry from the payload (middle segment before the dot)
      final dot = cred.lastIndexOf('.');
      if (dot < 0) return null;
      final payloadB64 = cred.substring(0, dot);
      // Convert base64url → standard base64
      final b64 = payloadB64.replaceAll('-', '+').replaceAll('_', '/');
      final padded = b64.padRight((b64.length + 3) ~/ 4 * 4, '=');
      final payload = jsonDecode(utf8.decode(base64.decode(padded))) as Map<String, dynamic>;
      final exp = (payload['exp'] as num?)?.toInt() ?? 0;

      await _storage.write(key: _credKey, value: cred);
      await _storage.write(key: _expKey,  value: exp.toString());
      return cred;
    } catch (_) {
      return null;
    }
  }

  /// Returns the cached credential if still valid (> 1 day remaining).
  /// Automatically refreshes if expired or near expiry.
  static Future<String?> get() async {
    final cred = await _storage.read(key: _credKey);
    final expStr = await _storage.read(key: _expKey);
    final exp = int.tryParse(expStr ?? '') ?? 0;
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;

    if (cred != null && exp > now + 86400) return cred;  // valid for > 1 day
    return refresh();  // refresh and return new one
  }

  /// Send the credential to an ESP32 captive portal at [deviceIp] for
  /// [role] ("student" or "lecturer").
  /// Returns the parsed JSON response or null on failure.
  static Future<Map<String, dynamic>?> sendToDevice(
      String deviceIp, String role) async {
    final cred = await get();
    if (cred == null) return null;

    final endpoint = role == 'lecturer' ? 'lecturer' : 'student';
    try {
      final localDio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
      ));
      final resp = await localDio.post(
        'http://$deviceIp/$endpoint/credential',
        data: {'credential': cred},
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
      if (resp.statusCode == 200 && resp.data is Map) {
        return Map<String, dynamic>.from(resp.data as Map);
      }
    } catch (_) {}
    return null;
  }

  static Future<void> clear() async {
    await _storage.delete(key: _credKey);
    await _storage.delete(key: _expKey);
  }
}
