import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/dikly_drawer.dart';
import 'hod_home_screen.dart';
import 'hod_courses_screen.dart';
import 'hod_lecturers_screen.dart';
import 'hod_reports_screen.dart';

class HodShell extends ConsumerStatefulWidget {
  final int initialTab;
  const HodShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<HodShell> createState() => _HodShellState();
}

class _HodShellState extends ConsumerState<HodShell> {
  late int _index;

  @override
  void initState() { super.initState(); _index = widget.initialTab; }

  static const _color = Color(0xFF7C2D12);
  static const _labels = ['Dashboard', 'Department', 'Staff', 'Reports'];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.school_outlined,
    Icons.people_outlined,
    Icons.bar_chart_outlined,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.dashboard_outlined, 'Dashboard', '/dashboard/hod'),
    ]),
    DrawerSection(header: 'MANAGEMENT', items: [
      DrawerItem(Icons.check_circle_outline, 'Approvals', '/hod/approvals'),
      DrawerItem(Icons.book_outlined, 'Course Approvals', '/hod/course-approvals'),
      DrawerItem(Icons.lock_outlined, 'Locked Students', '/hod/locked-students'),
      DrawerItem(Icons.warning_amber_outlined, 'Smart Alerts', '/hod/alerts'),
      DrawerItem(Icons.people_outlined, 'Lecturers', '/hod/lecturers'),
      DrawerItem(Icons.school_outlined, 'Students', '/hod/students'),
      DrawerItem(Icons.book_outlined, 'Courses', '/hod/courses'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'INSIGHTS', items: [
      DrawerItem(Icons.bar_chart_outlined, 'Performance', '/hod/performance'),
      DrawerItem(Icons.assessment_outlined, 'Reports', '/hod/reports'),
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

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final screens = const [
      HodHomeScreen(),
      HodCoursesScreen(),
      HodLecturersScreen(),
      HodReportsScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu_outlined),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: const Text('HOD Portal'),
        actions: [
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _color.withOpacity(0.12),
                child: Text(
                  (user?.name ?? 'H').substring(0, 1).toUpperCase(),
                  style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
              ])),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'logout', child: Row(children: [
                Icon(Icons.logout, size: 18, color: DiklyColors.error),
                SizedBox(width: 10), Text('Sign Out', style: TextStyle(color: DiklyColors.error)),
              ])),
            ],
            onSelected: (v) async {
              if (v == 'logout') await ref.read(authProvider.notifier).logout();
            },
          ),
        ],
      ),
      drawer: DiklyDrawer(
        portalTitle: 'HOD Portal',
        accentColor: _color,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: 'Head of Department',
        sections: _sections,
        onSignOut: () async {
          Navigator.pop(context);
          await ref.read(authProvider.notifier).logout();
        },
      ),
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        selectedItemColor: _color,
        items: List.generate(4, (i) => BottomNavigationBarItem(icon: Icon(_icons[i]), label: _labels[i])),
      ),
    );
  }
}
