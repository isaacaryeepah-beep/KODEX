import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'auth.dart';
import '../screens/auth/portal_select_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/student/student_shell.dart';
import '../screens/lecturer/lecturer_shell.dart';
import '../screens/manager/manager_shell.dart';
import '../screens/admin/admin_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/portal',
    redirect: (context, state) {
      final isAuthenticated = authState.status == AuthStatus.authenticated;
      final isUnknown = authState.status == AuthStatus.unknown;
      final loc = state.matchedLocation;
      final isAuthRoute = loc.startsWith('/login') || loc == '/portal';

      if (isUnknown) return null;
      if (!isAuthenticated && !isAuthRoute) return '/portal';
      if (isAuthenticated && isAuthRoute) {
        return _homeForRole(authState.user?.role ?? 'student');
      }
      return null;
    },
    routes: [
      GoRoute(path: '/portal', builder: (_, __) => const PortalSelectScreen()),
      GoRoute(
        path: '/login/:portal',
        builder: (_, state) => LoginScreen(portal: state.pathParameters['portal'] ?? 'student'),
      ),
      GoRoute(path: '/student', builder: (_, __) => const StudentShell()),
      GoRoute(path: '/lecturer', builder: (_, __) => const LecturerShell()),
      GoRoute(path: '/manager', builder: (_, __) => const ManagerShell()),
      GoRoute(path: '/admin', builder: (_, __) => const AdminShell()),
    ],
  );
});

String _homeForRole(String role) {
  switch (role) {
    case 'lecturer': return '/lecturer';
    case 'manager': return '/manager';
    case 'admin':
    case 'superadmin':
    case 'hod': return '/admin';
    default: return '/student';
  }
}
