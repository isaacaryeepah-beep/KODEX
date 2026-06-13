import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/dikly_drawer.dart';
import 'lecturer_home_screen.dart';
import 'lecturer_attendance_screen.dart';
import 'lecturer_quiz_screen.dart';
import 'lecturer_assignments_screen.dart';

class LecturerShell extends ConsumerStatefulWidget {
  final int initialTab;
  const LecturerShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<LecturerShell> createState() => _LecturerShellState();
}

class _LecturerShellState extends ConsumerState<LecturerShell> {
  late int _index;
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  static const _accentColor = Color(0xFF7C3AED);

  static const _labels = [
    'Dashboard',
    'Sessions',
    'Proctored/S...',
    'Assignment',
    'More',
  ];

  static const _icons = [
    Icons.dashboard_outlined,
    Icons.access_time_outlined,
    Icons.shield_outlined,
    Icons.assignment_outlined,
    Icons.more_horiz,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.dashboard_outlined, 'Dashboard', '/dashboard/lecturer'),
      DrawerItem(Icons.access_time_outlined, 'Sessions', '/lecturer/sessions'),
      DrawerItem(Icons.sensors_outlined, 'Attendance Device', '/lecturer/attendance-device'),
    ]),
    DrawerSection(header: 'CONTENT', items: [
      DrawerItem(Icons.search_outlined, 'Search', '/lecturer/search'),
      DrawerItem(Icons.book_outlined, 'Courses', '/courses'),
      DrawerItem(Icons.video_library_outlined, 'Course Videos', '/lecturer/course-videos'),
      DrawerItem(Icons.shield_outlined, 'Proctored/Snap Quiz', '/lecturer/quiz'),
      DrawerItem(Icons.visibility_outlined, 'Quiz Monitor', '/lecturer/quiz'),
      DrawerItem(Icons.calendar_today_outlined, 'Timetable', '/lecturer/schedule'),
      DrawerItem(Icons.storage_outlined, 'Question Bank', '/lecturer/question-bank'),
      DrawerItem(Icons.assignment_outlined, 'Assignment', '/lecturer/assignments'),
      DrawerItem(Icons.grade_outlined, 'Grade Book', '/gradebook'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'INSIGHTS', items: [
      DrawerItem(Icons.bar_chart_outlined, 'Performance', '/lecturer/performance'),
      DrawerItem(Icons.assessment_outlined, 'Reports', '/lecturer/performance'),
    ]),
    DrawerSection(items: [
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
    ]),
    DrawerSection(header: 'SUPPORT', items: [
      DrawerItem(Icons.help_outline, 'FAQ Center', '/faq'),
      DrawerItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      DrawerItem(Icons.person_outlined, 'My Profile', '/profile'),
      DrawerItem(Icons.phone_outlined, 'Contact Us', '/contact'),
      DrawerItem(Icons.info_outline, 'About', '/about'),
    ]),
  ];

  void _onTabTap(int i) {
    if (i == 4) {
      _scaffoldKey.currentState?.openDrawer();
    } else {
      setState(() => _index = i);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;

    final screens = [
      const LecturerHomeScreen(),
      const LecturerAttendanceScreen(),
      const LecturerQuizScreen(),
      const LecturerAssignmentsScreen(),
      // Index 4 is "More" — tapping opens drawer, so this is a dummy placeholder
      const _MorePlaceholder(),
    ];

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu_outlined),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
        ),
        title: const Text(
          'Lecturer Portal',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: Color(0xFF111827),
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _accentColor.withOpacity(0.12),
                child: Text(
                  (user?.name.isNotEmpty == true ? user!.name[0] : 'L').toUpperCase(),
                  style: const TextStyle(
                    color: _accentColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.name ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                    Text(
                      user?.email ?? '',
                      style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'profile',
                child: Row(children: [
                  Icon(Icons.person_outline, size: 18),
                  SizedBox(width: 10),
                  Text('My Profile'),
                ]),
              ),
              const PopupMenuItem(
                value: 'logout',
                child: Row(children: [
                  Icon(Icons.logout, size: 18, color: DiklyColors.error),
                  SizedBox(width: 10),
                  Text('Sign Out', style: TextStyle(color: DiklyColors.error)),
                ]),
              ),
            ],
            onSelected: (v) async {
              if (v == 'logout') await ref.read(authProvider.notifier).logout();
              if (v == 'profile') context.push('/profile');
            },
          ),
        ],
      ),
      drawer: DiklyDrawer(
        portalTitle: 'Lecturer Portal',
        accentColor: _accentColor,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: 'Lecturer',
        sections: _sections,
        onSignOut: () async {
          Navigator.pop(context);
          await ref.read(authProvider.notifier).logout();
        },
      ),
      body: IndexedStack(
        index: _index.clamp(0, 3),
        children: screens.sublist(0, 4),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: _onTabTap,
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: _accentColor,
        unselectedItemColor: const Color(0xFF6B7280),
        selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w400),
        elevation: 8,
        items: List.generate(5, (i) => BottomNavigationBarItem(
          icon: Icon(_icons[i]),
          label: _labels[i],
        )),
      ),
    );
  }
}

class _MorePlaceholder extends StatelessWidget {
  const _MorePlaceholder();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFFF1F5F9),
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
