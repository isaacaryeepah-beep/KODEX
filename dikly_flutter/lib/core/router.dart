import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'auth.dart';
import '../screens/auth/portal_selector.dart';
import '../screens/auth/login.dart';
import '../screens/student/student_shell.dart';
import '../screens/lecturer/lecturer_shell.dart';
import '../screens/manager/manager_shell.dart';
import '../screens/admin/admin_shell.dart';
import '../screens/hod/hod_shell.dart';
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
import '../screens/quizzes/quiz_history_screen.dart';
import '../screens/messages/messages_screen.dart';
import '../screens/meetings/meetings_screen.dart';
import '../screens/meetings/create_meeting_screen.dart';
import '../screens/admin/users_screen.dart';
import '../screens/admin/branches_screen.dart';
import '../screens/admin/audit_logs_screen.dart';
import '../screens/manager/team_screen.dart';
import '../screens/manager/leave_requests_screen.dart';
import '../screens/manager/timesheets_screen.dart';
import '../screens/employee/employee_shell.dart';
import '../screens/employee/employee_leaves_screen.dart';
import '../screens/employee/employee_shift_screen.dart';
import '../screens/shared/announcements_screen.dart';
import '../screens/shared/reports_screen.dart';
import '../screens/shared/profile_screen.dart';
import '../screens/shared/timetable_screen.dart';
import '../screens/shared/subscription_screen.dart';
import '../screens/shared/faq_screen.dart';
import '../screens/shared/sign_in_out_screen.dart';
import '../screens/shared/corporate_attendance_screen.dart';
import '../screens/shared/shifts_screen.dart';
import '../screens/shared/expenses_screen.dart';
import '../screens/shared/performance_screen.dart';
import '../screens/gradebook/grade_book_screen.dart';
import '../screens/hod/hod_approvals_screen.dart';
import '../screens/hod/hod_course_approvals_screen.dart';
import '../screens/hod/hod_unlock_students_screen.dart';
import '../screens/hod/hod_alerts_screen.dart';
import '../screens/hod/hod_performance_screen.dart';
import '../screens/hod/hod_lecturers_screen.dart';
import '../screens/hod/hod_students_screen.dart';
import '../screens/hod/hod_courses_screen.dart';
import '../screens/hod/hod_reports_screen.dart';
import '../screens/hod/hod_dept_messaging_screen.dart';
import '../screens/admin/admin_approvals_screen.dart';
import '../screens/admin/admin_search_screen.dart';
import '../screens/admin/admin_course_approvals_screen.dart';
import '../screens/admin/admin_programmes_screen.dart';
import '../screens/admin/admin_unlock_students_screen.dart';
import '../screens/admin/admin_class_reps_screen.dart';
import '../screens/admin/admin_reports_screen.dart';
import '../screens/lecturer/lecturer_performance_screen.dart';
import '../screens/lecturer/lecturer_attendance_device_screen.dart';
import '../screens/lecturer/lecturer_search_screen.dart';
import '../screens/lecturer/lecturer_quiz_screen.dart';
import '../screens/lecturer/lecturer_schedule_screen.dart';
import '../screens/lecturer/lecturer_assignments_screen.dart';
import '../screens/lecturer/lecturer_question_bank_screen.dart';
import '../screens/splash_screen.dart';

// Smooth fade+slide transition used for all routes
Page<void> _fadePage(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionDuration: const Duration(milliseconds: 220),
    reverseTransitionDuration: const Duration(milliseconds: 180),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurveTween(curve: Curves.easeIn).animate(animation),
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.03),
            end: Offset.zero,
          ).animate(CurveTween(curve: Curves.easeOut).animate(animation)),
          child: child,
        ),
      );
    },
  );
}

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      if (state.matchedLocation == '/splash') return null;
      final isLoading = authState.status == AuthStatus.unknown;
      if (isLoading) return null;
      final isAuthenticated = authState.status == AuthStatus.authenticated;
      final isOnAuth = state.matchedLocation == '/portal' ||
          state.matchedLocation.startsWith('/login');
      if (!isAuthenticated && !isOnAuth) return '/portal';
      if (isAuthenticated && isOnAuth) return _getDashboardRoute(authState.user?.role ?? 'student');
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(
        path: '/portal',
        pageBuilder: (context, state) => _fadePage(state, const PortalSelectorScreen()),
      ),
      GoRoute(
        path: '/login/:role',
        pageBuilder: (context, state) => _fadePage(
          state,
          LoginScreen(
            role: state.pathParameters['role'] ?? 'student',
            portalModeOverride: state.extra as String?,
          ),
        ),
      ),

      // Dashboards (shells)
      GoRoute(path: '/dashboard/student',  builder: (context, state) => const StudentShell()),
      GoRoute(path: '/dashboard/lecturer', builder: (context, state) => const LecturerShell()),
      GoRoute(path: '/dashboard/manager',  builder: (context, state) => const ManagerShell()),
      GoRoute(path: '/dashboard/admin',    builder: (context, state) => const AdminShell()),
      GoRoute(path: '/dashboard/hod',      builder: (context, state) => const HodShell()),
      GoRoute(path: '/dashboard/employee', builder: (context, state) => const EmployeeShell()),

      // Sessions
      GoRoute(path: '/sessions',        builder: (context, state) => const SessionsScreen()),
      GoRoute(path: '/sessions/create', builder: (context, state) => const CreateSessionScreen()),
      GoRoute(path: '/sessions/:id',    builder: (context, state) => SessionDetailScreen(sessionId: state.pathParameters['id']!)),

      // Meetings
      GoRoute(path: '/meetings',        builder: (context, state) => const MeetingsScreen()),
      GoRoute(path: '/meetings/create', builder: (context, state) => const CreateMeetingScreen()),

      // Courses
      GoRoute(path: '/courses',     builder: (context, state) => const CoursesScreen()),
      GoRoute(path: '/courses/:id', builder: (context, state) => CourseDetailScreen(courseId: state.pathParameters['id']!)),

      // Videos
      GoRoute(path: '/course-videos/:courseId', builder: (context, state) => CourseVideosScreen(courseId: state.pathParameters['courseId']!)),
      GoRoute(path: '/video-player', builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>?;
        return VideoPlayerScreen(url: extra?['url'] ?? '', title: extra?['title'] ?? '');
      }),

      // Attendance
      GoRoute(path: '/attendance', builder: (context, state) => const AttendanceScreen()),

      // Assignments
      GoRoute(path: '/assignments',     builder: (context, state) => const AssignmentsScreen()),
      GoRoute(path: '/assignments/:id', builder: (context, state) => AssignmentDetailScreen(assignmentId: state.pathParameters['id']!)),

      // Quizzes
      GoRoute(path: '/quizzes',       builder: (context, state) => const QuizzesScreen()),
      GoRoute(path: '/quiz-history',  builder: (context, state) => const QuizHistoryScreen()),

      // Communicate
      GoRoute(path: '/messages',      builder: (context, state) => const MessagesScreen()),
      GoRoute(path: '/announcements', builder: (context, state) => const AnnouncementsScreen()),

      // Shared
      GoRoute(path: '/reports',      builder: (context, state) => const ReportsScreen()),
      GoRoute(path: '/profile',      builder: (context, state) => const ProfileScreen()),
      GoRoute(path: '/gradebook',    builder: (context, state) => const GradeBookScreen()),
      GoRoute(path: '/timetable',    builder: (context, state) => const TimetableScreen()),
      GoRoute(path: '/subscription', builder: (context, state) => const SubscriptionScreen()),
      GoRoute(path: '/faq',          builder: (context, state) => const FaqScreen()),
      GoRoute(path: '/contact',      builder: (context, state) => const FaqScreen()),
      GoRoute(path: '/about',        builder: (context, state) => const FaqScreen()),
      GoRoute(path: '/performance',  builder: (context, state) => const PerformanceScreen()),

      // Corporate
      GoRoute(path: '/sign-in-out',           builder: (context, state) => const SignInOutScreen()),
      GoRoute(path: '/corporate-attendance',  builder: (context, state) => const CorporateAttendanceScreen()),
      GoRoute(path: '/shifts',                builder: (context, state) => const ShiftsScreen()),
      GoRoute(path: '/expenses',              builder: (context, state) => const ExpensesScreen()),

      // Admin
      GoRoute(path: '/admin/users',       builder: (context, state) => const UsersScreen()),
      GoRoute(path: '/admin/branches',    builder: (context, state) => const BranchesScreen()),
      GoRoute(path: '/admin/audit-logs',  builder: (context, state) => const AuditLogsScreen()),
      GoRoute(path: '/admin/reports',     builder: (context, state) => const AdminReportsScreen()),

      // Manager
      GoRoute(path: '/manager/team',          builder: (context, state) => const TeamScreen()),
      GoRoute(path: '/manager/leave-requests',builder: (context, state) => const LeaveRequestsScreen()),
      GoRoute(path: '/manager/timesheets',    builder: (context, state) => const TimesheetsScreen()),

      // Employee
      GoRoute(path: '/employee/leaves', builder: (context, state) => const EmployeeLeavesScreen()),
      GoRoute(path: '/employee/shift',  builder: (context, state) => const EmployeeShiftScreen()),

      // HOD
      GoRoute(path: '/hod/approvals',       builder: (context, state) => const HodApprovalsScreen()),
      GoRoute(path: '/hod/course-approvals',builder: (context, state) => const HodCourseApprovalsScreen()),
      GoRoute(path: '/hod/locked-students', builder: (context, state) => const HodUnlockStudentsScreen()),
      GoRoute(path: '/hod/alerts',          builder: (context, state) => const HodAlertsScreen()),
      GoRoute(path: '/hod/performance',     builder: (context, state) => const HodPerformanceScreen()),
      GoRoute(path: '/hod/lecturers',       builder: (context, state) => const HodLecturersScreen()),
      GoRoute(path: '/hod/students',        builder: (context, state) => const HodStudentsScreen()),
      GoRoute(path: '/hod/courses',         builder: (context, state) => const HodCoursesScreen()),
      GoRoute(path: '/hod/reports',         builder: (context, state) => Scaffold(
        backgroundColor: const Color(0xFFF1F5F9),
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
          leading: const BackButton(),
          title: const Text('Department Reports', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
        ),
        body: const HodReportsScreen(),
      )),
      GoRoute(path: '/hod/dept-messaging',  builder: (context, state) => const HodDeptMessagingScreen()),

      // Admin
      GoRoute(path: '/admin/approvals',        builder: (context, state) => const AdminApprovalsScreen()),
      GoRoute(path: '/admin/search',           builder: (context, state) => const AdminSearchScreen()),
      GoRoute(path: '/admin/course-approvals', builder: (context, state) => const AdminCourseApprovalsScreen()),
      GoRoute(path: '/admin/programmes',       builder: (context, state) => const AdminProgrammesScreen()),
      GoRoute(path: '/admin/unlock-students',  builder: (context, state) => const AdminUnlockStudentsScreen()),
      GoRoute(path: '/admin/class-reps',       builder: (context, state) => const AdminClassRepsScreen()),

      // Lecturer
      GoRoute(path: '/lecturer/performance',     builder: (context, state) => const LecturerPerformanceScreen()),
      GoRoute(path: '/lecturer/attendance-device', builder: (context, state) => const LecturerAttendanceDeviceScreen()),
      GoRoute(path: '/lecturer/search',          builder: (context, state) => const LecturerSearchScreen()),
      GoRoute(path: '/lecturer/quiz',            builder: (context, state) => const LecturerQuizScreen()),
      GoRoute(path: '/lecturer/schedule',        builder: (context, state) => const LecturerScheduleScreen()),
      GoRoute(path: '/lecturer/assignments',     builder: (context, state) => const LecturerAssignmentsScreen()),
      GoRoute(path: '/lecturer/question-bank',   builder: (context, state) => const LecturerQuestionBankScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text('Page not found: ${state.uri}')),
    ),
  );
});

String _getDashboardRoute(String role) {
  switch (role) {
    case 'lecturer': return '/dashboard/lecturer';
    case 'manager':  return '/dashboard/manager';
    case 'admin':    return '/dashboard/admin';
    case 'hod':      return '/dashboard/hod';
    case 'employee': return '/dashboard/employee';
    case 'student':
    default:         return '/dashboard/student';
  }
}
