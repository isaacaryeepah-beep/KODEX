import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/dikly_drawer.dart';
import 'employee_home_screen.dart';
import 'employee_attendance_screen.dart';
import 'employee_leaves_screen.dart';

class EmployeeShell extends ConsumerStatefulWidget {
  final int initialTab;
  const EmployeeShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<EmployeeShell> createState() => _EmployeeShellState();
}

class _EmployeeShellState extends ConsumerState<EmployeeShell> {
  late int _index;
  static const _color = Color(0xFF059669); // green — employee accent (web design token)

  static const _labels = ['Home', 'Attendance', 'Leave', 'More'];
  static const _icons = [
    Icons.home_outlined,
    Icons.check_circle_outline,
    Icons.calendar_today_outlined,
    Icons.menu_outlined,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.home_outlined, 'Home', '/dashboard/employee'),
    ]),
    DrawerSection(header: 'ATTENDANCE', items: [
      DrawerItem(Icons.login_outlined, 'Clock In / Out', '/sign-in-out'),
      DrawerItem(Icons.event_available_outlined, 'My Attendance', '/corporate-attendance'),
      DrawerItem(Icons.access_time_outlined, 'My Shift', '/employee/shift'),
      DrawerItem(Icons.event_note_outlined, 'Leave', '/employee/leaves'),
      DrawerItem(Icons.school_outlined, 'My Assessments', '/reports'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.notifications_outlined, 'Notifications', '/announcements'),
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'INSIGHTS', items: [
      DrawerItem(Icons.trending_up_outlined, 'My Performance', '/performance'),
      DrawerItem(Icons.receipt_long_outlined, 'Timesheet', '/manager/timesheets'),
      DrawerItem(Icons.attach_money_outlined, 'Expenses', '/expenses'),
      DrawerItem(Icons.inventory_2_outlined, 'My Assets', '/reports'),
    ]),
    DrawerSection(header: 'SUPPORT', items: [
      DrawerItem(Icons.smart_toy_outlined, 'Assistant', '/support'),
      DrawerItem(Icons.support_agent_outlined, 'Support', '/support'),
      DrawerItem(Icons.help_outline, 'FAQ Center', '/faq'),
      DrawerItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      DrawerItem(Icons.person_outlined, 'Profile', '/profile'),
      DrawerItem(Icons.phone_outlined, 'Contact Us', '/contact'),
      DrawerItem(Icons.info_outline, 'About', '/about'),
    ]),
  ];

  @override
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  void _onTabTap(int i) {
    if (i == 3) {
      Scaffold.of(context).openDrawer();
    } else {
      setState(() => _index = i);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final tabTitle = _index < 3 ? _labels[_index] : 'More';

    final screens = const [
      EmployeeHomeScreen(),
      EmployeeAttendanceScreen(),
      EmployeeLeavesScreen(),
    ];

    return Scaffold(
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
                color: _color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Employee Portal',
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
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _color.withOpacity(0.12),
                child: Text(
                  (user?.name ?? 'E').substring(0, 1).toUpperCase(),
                  style: TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                  if (user?.role != null)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: _color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                      child: Text(user!.role.toUpperCase(), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _color)),
                    ),
                ]),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'profile', child: Row(children: [Icon(Icons.person_outline, size: 18, color: DiklyColors.textSecondary), SizedBox(width: 10), Text('Profile')])),
              const PopupMenuItem(value: 'logout', child: Row(children: [Icon(Icons.logout, size: 18, color: DiklyColors.error), SizedBox(width: 10), Text('Sign Out', style: TextStyle(color: DiklyColors.error))])),
            ],
            onSelected: (v) async {
              if (v == 'logout') await ref.read(authProvider.notifier).logout();
              else if (v == 'profile') context.push('/profile');
            },
          ),
        ],
      ),
      drawer: DiklyDrawer(
        portalTitle: 'Employee Portal',
        accentColor: _color,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: 'Employee',
        institutionCode: user?.institutionCode ?? '',
        sections: _sections,
        onSignOut: () async {
          Navigator.pop(context);
          await ref.read(authProvider.notifier).logout();
        },
      ),
      body: IndexedStack(
        index: _index < 3 ? _index : 0,
        children: screens,
      ),
      bottomNavigationBar: Builder(
        builder: (ctx) => BottomNavigationBar(
          currentIndex: _index < 3 ? _index : 3,
          onTap: (i) {
            if (i == 3) {
              Scaffold.of(ctx).openDrawer();
            } else {
              setState(() => _index = i);
            }
          },
          selectedItemColor: _color,
          unselectedItemColor: DiklyColors.textLight,
          backgroundColor: DiklyColors.surface,
          type: BottomNavigationBarType.fixed,
          elevation: 8,
          items: List.generate(4, (i) => BottomNavigationBarItem(icon: Icon(_icons[i]), label: _labels[i])),
        ),
      ),
    );
  }
}
