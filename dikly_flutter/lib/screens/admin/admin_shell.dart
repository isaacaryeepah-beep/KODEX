import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/dikly_drawer.dart';
import 'admin_home_screen.dart';
import 'admin_users_screen.dart';
import 'admin_courses_screen.dart';
import 'admin_reports_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  final int initialTab;
  const AdminShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  late int _index;

  @override
  void initState() { super.initState(); _index = widget.initialTab; }

  static const _color = Color(0xFFDC2626);
  static const _labels = ['Dashboard', 'Users', 'Courses', 'Reports'];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.people_outlined,
    Icons.book_outlined,
    Icons.bar_chart_outlined,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.dashboard_outlined, 'Dashboard', '/dashboard/admin'),
    ]),
    DrawerSection(header: 'ACADEMIC', items: [
      DrawerItem(Icons.people_outlined, 'Users', '/admin/users'),
      DrawerItem(Icons.book_outlined, 'Courses', '/courses'),
      DrawerItem(Icons.play_circle_outline, 'Sessions', '/sessions'),
      DrawerItem(Icons.quiz_outlined, 'Quizzes', '/quizzes'),
      DrawerItem(Icons.assignment_outlined, 'Assignments', '/assignments'),
      DrawerItem(Icons.schedule_outlined, 'Timetable', '/timetable'),
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
    ]),
    DrawerSection(header: 'WORKFORCE', items: [
      DrawerItem(Icons.login_outlined, 'Sign In / Out', '/sign-in-out'),
      DrawerItem(Icons.event_available_outlined, 'Attendance', '/corporate-attendance'),
      DrawerItem(Icons.calendar_month_outlined, 'Shifts', '/shifts'),
      DrawerItem(Icons.event_note_outlined, 'Leave Requests', '/manager/leave-requests'),
      DrawerItem(Icons.receipt_long_outlined, 'Timesheets', '/manager/timesheets'),
      DrawerItem(Icons.attach_money_outlined, 'Expenses', '/expenses'),
      DrawerItem(Icons.business_outlined, 'Branches', '/admin/branches'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'SYSTEM', items: [
      DrawerItem(Icons.history_outlined, 'Audit Logs', '/admin/audit-logs'),
      DrawerItem(Icons.trending_up_outlined, 'Performance', '/performance'),
      DrawerItem(Icons.assessment_outlined, 'Reports', '/reports'),
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
      AdminHomeScreen(),
      AdminUsersScreen(),
      AdminCoursesScreen(),
      AdminReportsScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu_outlined),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: const Text('Admin Portal'),
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
                  (user?.name ?? 'A').substring(0, 1).toUpperCase(),
                  style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: _color.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                  child: Text((user?.role ?? 'admin').toUpperCase(), style: TextStyle(fontSize: 10, color: _color, fontWeight: FontWeight.w700)),
                ),
              ])),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'profile', child: Row(children: [Icon(Icons.person_outline, size: 18), SizedBox(width: 10), Text('My Profile')])),
              const PopupMenuItem(value: 'logout', child: Row(children: [
                Icon(Icons.logout, size: 18, color: DiklyColors.error),
                SizedBox(width: 10), Text('Sign Out', style: TextStyle(color: DiklyColors.error)),
              ])),
            ],
            onSelected: (v) async {
              if (v == 'logout') await ref.read(authProvider.notifier).logout();
              if (v == 'profile') context.push('/profile');
            },
          ),
        ],
      ),
      drawer: DiklyDrawer(
        portalTitle: 'Admin Portal',
        accentColor: _color,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: 'Administrator',
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
