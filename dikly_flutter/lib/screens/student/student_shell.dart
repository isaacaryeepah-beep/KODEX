import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/dikly_drawer.dart';
import 'student_home_screen.dart';
import 'student_assignments_screen.dart';
import 'student_courses_screen.dart';
import '../attendance/attendance_screen.dart';

class StudentShell extends ConsumerStatefulWidget {
  final int initialTab;
  const StudentShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends ConsumerState<StudentShell> {
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  static const Color _accent = Color(0xFF7C3AED);

  static const _labels = ['Home', 'Courses', 'Attendance', 'Assignments'];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.book_outlined,
    Icons.check_circle_outline,
    Icons.assignment_outlined,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.dashboard_outlined, 'Dashboard', '/dashboard/student'),
    ]),
    DrawerSection(header: 'ATTENDANCE', items: [
      DrawerItem(Icons.check_circle_outline, 'Mark Attendance', '/attendance'),
      DrawerItem(Icons.history_outlined, 'My Attendance', '/my-attendance'),
    ]),
    DrawerSection(header: 'ACADEMIC', items: [
      DrawerItem(Icons.book_outlined, 'My Courses', '/courses'),
      DrawerItem(Icons.schedule_outlined, 'Timetable', '/timetable'),
      DrawerItem(Icons.shield_outlined, 'Proctored/Snap Quiz', '/quizzes'),
      DrawerItem(Icons.assignment_outlined, 'Assignment', '/assignments'),
      DrawerItem(Icons.grade_outlined, 'My Grades', '/gradebook'),
      DrawerItem(Icons.assessment_outlined, 'My Results', '/quiz-history'),
      DrawerItem(Icons.video_library_outlined, 'Course Videos', '/student/course-videos'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
    ]),
    DrawerSection(header: 'SUPPORT', items: [
      DrawerItem(Icons.support_agent_outlined, 'Support & Helpdesk', '/support'),
      DrawerItem(Icons.help_outline, 'FAQ Center', '/faq'),
      DrawerItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      DrawerItem(Icons.person_outlined, 'Profile', '/profile'),
      DrawerItem(Icons.phone_outlined, 'Contact Us', '/contact'),
      DrawerItem(Icons.info_outline, 'About', '/about'),
    ]),
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final initial = (user?.name ?? 'S').substring(0, 1).toUpperCase();

    final screens = const [
      StudentHomeScreen(),
      StudentCoursesScreen(),
      AttendanceScreen(),
      StudentAssignmentsScreen(),
    ];

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0D1117),
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        shape: const Border(bottom: BorderSide(color: Color(0xFFE5E7EB), width: 1)),
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu_outlined, color: Color(0xFF0D1117)),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: Row(
          children: [
            Container(
              width: 3, height: 20,
              decoration: BoxDecoration(
                color: _accent,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Student Portal',
              style: GoogleFonts.dmSans(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF0D1117),
                letterSpacing: -0.3,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: PopupMenuButton<String>(
              offset: const Offset(0, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: DiklyColors.border),
              ),
              elevation: 4,
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _accent.withOpacity(0.12),
                child: Text(
                  initial,
                  style: TextStyle(
                    color: _accent,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
              itemBuilder: (_) => [
                PopupMenuItem(
                  enabled: false,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? '',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: DiklyColors.text,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        user?.email ?? '',
                        style: const TextStyle(
                          fontSize: 12,
                          color: DiklyColors.textLight,
                        ),
                      ),
                    ],
                  ),
                ),
                const PopupMenuDivider(height: 1),
                PopupMenuItem(
                  value: 'profile',
                  child: Row(
                    children: const [
                      Icon(Icons.person_outline, size: 18, color: DiklyColors.textSecondary),
                      SizedBox(width: 10),
                      Text('Profile', style: TextStyle(fontSize: 14, color: DiklyColors.text)),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: 'logout',
                  child: Row(
                    children: const [
                      Icon(Icons.logout, size: 18, color: DiklyColors.error),
                      SizedBox(width: 10),
                      Text('Sign Out', style: TextStyle(fontSize: 14, color: DiklyColors.error)),
                    ],
                  ),
                ),
              ],
              onSelected: (v) async {
                if (v == 'logout') await ref.read(authProvider.notifier).logout();
                if (v == 'profile') context.push('/profile');
              },
            ),
          ),
        ],
      ),
      drawer: DiklyDrawer(
        portalTitle: 'Student Portal',
        accentColor: _accent,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: 'Student',
        sections: _sections,
        onSignOut: () async {
          Navigator.pop(context);
          await ref.read(authProvider.notifier).logout();
        },
      ),
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFE5E7EB), width: 1)),
          boxShadow: [
            BoxShadow(color: Color(0x0D000000), blurRadius: 12, offset: Offset(0, -2)),
            BoxShadow(color: Color(0x08000000), blurRadius: 4,  offset: Offset(0, -1)),
          ],
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          height: 72,
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.book_outlined), selectedIcon: Icon(Icons.book_rounded), label: 'Courses'),
            NavigationDestination(icon: Icon(Icons.check_circle_outline), selectedIcon: Icon(Icons.check_circle), label: 'Attendance'),
            NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: 'Assignments'),
          ],
        ),
      ),
    );
  }
}
