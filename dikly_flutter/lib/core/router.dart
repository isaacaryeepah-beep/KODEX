import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'auth.dart';
import '../screens/auth/portal_selector.dart';
import '../screens/auth/login.dart';
import '../screens/dashboard/student_dashboard.dart';
import '../screens/dashboard/lecturer_dashboard.dart';
import '../screens/dashboard/manager_dashboard.dart';
import '../screens/dashboard/admin_dashboard.dart';
import '../screens/sessions/sessions_screen.dart';
import '../screens/sessions/create_session_screen.dart';
import '../screens/sessions/session_detail_screen.dart';
import '../screens/courses/courses_screen.dart';
import '../screens/courses/course_detail_screen.dart';
import '../screens/course_videos/course_videos_screen.dart';
import '../screens/course_videos/video_player_screen.dart';
import '../screens/attendance/attendance_screen.dart';
import '../screens/assignments/assignments_screen.dart';
import '../screens/assignments/assignment_detail_screen.dart';
import '../screens/quizzes/quizzes_screen.dart';
import '../screens/messages/messages_screen.dart';
import '../screens/meetings/meetings_screen.dart';
import '../screens/admin/users_screen.dart';
import '../screens/manager/team_screen.dart';
import '../screens/manager/leave_requests_screen.dart';
import '../screens/manager/timesheets_screen.dart';
import '../screens/shared/announcements_screen.dart';
import '../screens/shared/reports_screen.dart';
import '../screens/shared/profile_screen.dart';
import '../screens/gradebook/grade_book_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/portal',
    redirect: (context, state) {
      final isLoading = authState.status == AuthStatus.unknown;
      if (isLoading) return null;

      final isAuthenticated = authState.status == AuthStatus.authenticated;
      final isOnAuth = state.matchedLocation == '/portal' ||
          state.matchedLocation.startsWith('/login');

      if (!isAuthenticated && !isOnAuth) return '/portal';
      if (isAuthenticated && isOnAuth) {
        return _getDashboardRoute(authState.user?.role ?? 'student');
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/portal',
        builder: (context, state) => const PortalSelectorScreen(),
      ),
      GoRoute(
        path: '/login/:role',
        builder: (context, state) {
          final role = state.pathParameters['role'] ?? 'student';
          return LoginScreen(role: role);
        },
      ),
      // Dashboards
      GoRoute(path: '/dashboard/student', builder: (context, state) => const StudentDashboard()),
      GoRoute(path: '/dashboard/lecturer', builder: (context, state) => const LecturerDashboard()),
      GoRoute(path: '/dashboard/manager', builder: (context, state) => const ManagerDashboard()),
      GoRoute(path: '/dashboard/admin', builder: (context, state) => const AdminDashboard()),
      // Sessions
      GoRoute(path: '/sessions', builder: (context, state) => const SessionsScreen()),
      GoRoute(path: '/sessions/create', builder: (context, state) => const CreateSessionScreen()),
      GoRoute(path: '/sessions/:id', builder: (context, state) => SessionDetailScreen(sessionId: state.pathParameters['id']!)),
      // Meetings
      GoRoute(path: '/meetings', builder: (context, state) => const MeetingsScreen()),
      // Courses
      GoRoute(path: '/courses', builder: (context, state) => const CoursesScreen()),
      GoRoute(path: '/courses/:id', builder: (context, state) => CourseDetailScreen(courseId: state.pathParameters['id']!)),
      // Course Videos
      GoRoute(path: '/course-videos/:courseId', builder: (context, state) => CourseVideosScreen(courseId: state.pathParameters['courseId']!)),
      GoRoute(
        path: '/video-player',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          return VideoPlayerScreen(url: extra?['url'] ?? '', title: extra?['title'] ?? '');
        },
      ),
      // Attendance
      GoRoute(path: '/attendance', builder: (context, state) => const AttendanceScreen()),
      // Assignments
      GoRoute(path: '/assignments', builder: (context, state) => const AssignmentsScreen()),
      GoRoute(path: '/assignments/:id', builder: (context, state) => AssignmentDetailScreen(assignmentId: state.pathParameters['id']!)),
      // Quizzes
      GoRoute(path: '/quizzes', builder: (context, state) => const QuizzesScreen()),
      // Messages
      GoRoute(path: '/messages', builder: (context, state) => const MessagesScreen()),
      // Admin
      GoRoute(path: '/admin/users', builder: (context, state) => const UsersScreen()),
      // Manager
      GoRoute(path: '/manager/team', builder: (context, state) => const TeamScreen()),
      GoRoute(path: '/manager/leave-requests', builder: (context, state) => const LeaveRequestsScreen()),
      GoRoute(path: '/manager/timesheets', builder: (context, state) => const TimesheetsScreen()),
      // Shared
      GoRoute(path: '/announcements', builder: (context, state) => const AnnouncementsScreen()),
      GoRoute(path: '/reports', builder: (context, state) => const ReportsScreen()),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      // Grade Book
      GoRoute(path: '/gradebook', builder: (context, state) => const GradeBookScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text('Page not found: ${state.uri}')),
    ),
  );
});

String _getDashboardRoute(String role) {
  switch (role) {
    case 'lecturer': return '/dashboard/lecturer';
    case 'manager': return '/dashboard/manager';
    case 'admin':
    case 'hod': return '/dashboard/admin';
    case 'student':
    default: return '/dashboard/student';
  }
}
