import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import '../models/user.dart';
import 'api.dart';
import 'cache.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

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
    required String email,
    required String password,
    required String loginRole,
    required String portalMode,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final deviceId = await _getDeviceId();
      final result = await _api.login(
        email: email,
        password: password,
        loginRole: loginRole,
        portalMode: portalMode,
        deviceId: deviceId,
      );

      final token = result['token']?.toString() ?? '';
      await _storage.write(key: 'auth_token', value: token);

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
        } else if (str.contains('network') || str.contains('connection')) {
          message = 'Network error. Check your connection.';
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

  Future<void> logout() async {
    state = state.copyWith(isLoading: true);
    await _api.logout();
    await _storage.delete(key: 'auth_token');
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
