import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';
import '../models/user.dart';
import 'api.dart';

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
      final user = await _api.getMe();
      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        token: token,
      );
    } catch (_) {
      await _storage.delete(key: 'auth_token');
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
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

      final userData = result['user'] as Map<String, dynamic>? ?? {};
      // Merge portalMode into user data if not present
      if (!userData.containsKey('portalMode')) {
        userData['portalMode'] = portalMode;
      }
      if (!userData.containsKey('role') && !userData.containsKey('loginRole')) {
        userData['role'] = loginRole;
      }
      final user = User.fromJson(userData);

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
      state = state.copyWith(user: user);
    } catch (_) {}
  }

  Future<String> _getDeviceId() async {
    try {
      final di = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await di.androidInfo;
        return info.id;
      } else if (Platform.isIOS) {
        final info = await di.iosInfo;
        return info.identifierForVendor ?? 'ios-device';
      }
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
