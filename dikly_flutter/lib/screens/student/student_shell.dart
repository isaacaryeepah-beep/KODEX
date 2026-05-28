import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
      DrawerItem(Icons.check_circle_outline, 'Attendance', '/attendance'),
      DrawerItem(Icons.assignment_outlined, 'Assignments', '/assignments'),
      DrawerItem(Icons.quiz_outlined, 'Quizzes', '/quizzes'),
    ]),
    DrawerSection(header: 'CONTENT', items: [
      DrawerItem(Icons.book_outlined, 'Courses', '/courses'),
      DrawerItem(Icons.play_circle_outline, 'Videos', '/course-videos/all'),
      DrawerItem(Icons.schedule_outlined, 'Schedule', '/timetable'),
      DrawerItem(Icons.grade_outlined, 'Gradebook', '/gradebook'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
    ]),
    DrawerSection(header: 'SUPPORT', items: [
      DrawerItem(Icons.help_outline, 'FAQ', '/faq'),
      DrawerItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      DrawerItem(Icons.person_outlined, 'Profile', '/profile'),
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
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu_outlined, color: DiklyColors.text),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: const Text(
          'Student Portal',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: DiklyColors.text,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: DiklyColors.border),
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
                backgroundColor: const Color(0xFF7C3AED),
                child: Text(
                  initial,
                  style: const TextStyle(
                    color: Colors.white,
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
        decoration: BoxDecoration(
          color: Colors.white,
          border: const Border(top: BorderSide(color: Color(0xFFEEEEFF), width: 1)),
          boxShadow: [
            BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.08), blurRadius: 20, offset: const Offset(0, -4)),
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
