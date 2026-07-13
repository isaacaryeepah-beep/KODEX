import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import '../models/user.dart';
import 'api.dart';
import 'cache.dart';

// requires2FA: password accepted but the account has two-factor enabled —
// a 6-digit emailed code must be verified before the session is treated as
// signed in (mirrors the web's initiate2FA modal gate).
enum AuthStatus { unknown, authenticated, unauthenticated, requires2FA }

class AuthState {
  final AuthStatus status;
  final User? user;
  final String? token;
  final String? error;
  final bool isLoading;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.token,
    this.error,
    this.isLoading = false,
  });

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? token,
    String? error,
    bool? isLoading,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      token: token ?? this.token,
      error: error,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiService _api;
  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  User? _pending2FAUser;

  AuthNotifier(this._api) : super(const AuthState()) {
    _init();
  }

  Future<void> _init() async {
    final token = await _storage.read(key: 'auth_token');
    if (token == null) {
      state = state.copyWith(status: AuthStatus.unauthenticated);
      return;
    }
    try {
      // getMe uses _cachedGet — returns cached data when offline.
      final user = await _api.getMe();
      await _cacheUser(user);
      state = AuthState(status: AuthStatus.authenticated, user: user, token: token);
    } catch (e) {
      // If it's a network error, try loading a previously cached user so the
      // app works offline without forcing the user to log in again.
      final cachedUser = _loadCachedUser();
      if (cachedUser != null) {
        state = AuthState(status: AuthStatus.authenticated, user: cachedUser, token: token);
      } else {
        // Only a 401/403 should clear the token; network errors keep it.
        final is401 = e.toString().contains('401') || e.toString().contains('403');
        if (is401) {
          await _storage.delete(key: 'auth_token');
          state = state.copyWith(status: AuthStatus.unauthenticated);
        } else {
          // Unknown user but token present — let router decide.
          state = AuthState(status: AuthStatus.authenticated, user: null, token: token);
        }
      }
    }
  }

  Future<void> _cacheUser(User user) async {
    await CacheService.set('cached_user', user.toJson());
  }

  User? _loadCachedUser() {
    final raw = CacheService.get<Map<String, dynamic>>('cached_user');
    if (raw == null) return null;
    try { return User.fromJson(raw); } catch (_) { return null; }
  }

  Future<bool> login({
    required String password,
    required String loginRole,
    required String portalMode,
    String? email,
    String? indexNumber,
    String? institutionCode,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final deviceId = await _getDeviceId();
      final result = await _api.login(
        password: password,
        loginRole: loginRole,
        portalMode: portalMode,
        deviceId: deviceId,
        email: email,
        indexNumber: indexNumber,
        institutionCode: institutionCode,
      );

      final token = result['token']?.toString() ?? '';
      await _storage.write(key: 'auth_token', value: token);
      // Access tokens expire after 15 minutes — the refresh token (30 days)
      // is what keeps the session alive via the 401-refresh interceptor.
      final refreshToken = result['refreshToken']?.toString();
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _storage.write(key: 'refresh_token', value: refreshToken);
      }

      final rawUser = result['user'];
      final userData = (rawUser is Map<String, dynamic> ? rawUser : <String, dynamic>{});
      // Merge portalMode into user data if not present
      if (!userData.containsKey('portalMode')) {
        userData['portalMode'] = portalMode;
      }
      if (!userData.containsKey('role') && !userData.containsKey('loginRole')) {
        userData['role'] = loginRole;
      }
      final user = User.fromJson(userData);

      // Two-factor gate — same contract as the web's initiate2FA: the login
      // response carries user.twoFactorEnabled; when true, email the code and
      // hold at requires2FA until verify2FACode succeeds.
      if (userData['twoFactorEnabled'] == true) {
        _pending2FAUser = user;
        try {
          await _api.send2FACode();
        } catch (_) {
          await _storage.delete(key: 'auth_token');
          await _storage.delete(key: 'refresh_token');
          state = state.copyWith(
            status: AuthStatus.unauthenticated,
            isLoading: false,
            error: 'Failed to send 2FA code. Please try again.',
          );
          return false;
        }
        state = AuthState(status: AuthStatus.requires2FA, token: token);
        return true;
      }

      await _cacheUser(user);
      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        token: token,
      );
      return true;
    } catch (e) {
      String message = 'Login failed. Please try again.';
      if (e is Exception) {
        final str = e.toString();
        if (str.contains('401') || str.contains('Invalid') || str.contains('incorrect')) {
          message = 'Invalid email or password.';
        } else if (str.contains('403')) {
          message = 'Access denied. Check your portal selection.';
        } else if (str.contains('XMLHttpRequest') || str.contains('CORS') || str.contains('cors')) {
          message = 'Connection blocked (CORS). Server may be updating — try again in 1 minute.';
        } else if (str.contains('network') || str.contains('connection') || str.contains('Connection')) {
          message = 'Cannot reach server. Check your internet or try again shortly.';
        }
      }
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        isLoading: false,
        error: message,
      );
      return false;
    }
  }

  /// Verifies the emailed 6-digit code and completes the sign-in that
  /// login() left parked at requires2FA.
  Future<bool> completeTwoFactor(String code) async {
    final user = _pending2FAUser;
    if (user == null) return false;
    try {
      await _api.verify2FACode(code);
    } catch (_) {
      state = state.copyWith(error: 'Invalid or expired code. Try again.');
      return false;
    }
    _pending2FAUser = null;
    await _cacheUser(user);
    state = AuthState(status: AuthStatus.authenticated, user: user, token: state.token);
    return true;
  }

  /// Abandons a pending 2FA challenge — discards the tokens issued at the
  /// password step so a half-authenticated session can't linger.
  Future<void> cancelTwoFactor() async {
    _pending2FAUser = null;
    await _storage.delete(key: 'auth_token');
    await _storage.delete(key: 'refresh_token');
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> logout() async {
    state = state.copyWith(isLoading: true);
    await _api.logout();
    await _storage.delete(key: 'auth_token');
    await _storage.delete(key: 'refresh_token');
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> refreshUser() async {
    try {
      final user = await _api.getMe();
      await _cacheUser(user);
      state = state.copyWith(user: user);
    } catch (_) {}
  }

  Future<String> _getDeviceId() async {
    if (kIsWeb) return 'web-device';
    try {
      final di = DeviceInfoPlugin();
      final info = await di.deviceInfo;
      final data = info.data;
      return data['id']?.toString() ?? data['identifierForVendor']?.toString() ?? 'flutter-device';
    } catch (_) {}
    return 'flutter-device';
  }

  void clearError() {
    state = state.copyWith(error: null);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(apiService);
});

final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(authProvider).user;
});
