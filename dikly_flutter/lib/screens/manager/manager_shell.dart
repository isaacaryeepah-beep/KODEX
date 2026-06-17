import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/dikly_drawer.dart';
import 'manager_home_screen.dart';
import 'manager_employees_screen.dart';
import 'manager_leave_screen.dart';
import 'manager_reports_screen.dart';
import 'timesheets_screen.dart';

class ManagerShell extends ConsumerStatefulWidget {
  final int initialTab;
  const ManagerShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<ManagerShell> createState() => _ManagerShellState();
}

class _ManagerShellState extends ConsumerState<ManagerShell> {
  late int _index;

  @override
  void initState() { super.initState(); _index = widget.initialTab; }

  static const _color = Color(0xFF1D4ED8); // blue — manager accent (web design token)

  static const _labels = ['Dashboard', 'Team', 'Leave', 'Timesheets'];
  static const _icons = [
    Icons.dashboard_outlined,
    Icons.people_outlined,
    Icons.event_note_outlined,
    Icons.receipt_long_outlined,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.dashboard_outlined, 'Dashboard', '/dashboard/manager'),
    ]),
    DrawerSection(header: 'MANAGE', items: [
      DrawerItem(Icons.check_circle_outline, 'Approvals', '/manager/leave-requests'),
      DrawerItem(Icons.people_outlined, 'Team', '/manager/team'),
    ]),
    DrawerSection(header: 'WORKFORCE', items: [
      DrawerItem(Icons.login_outlined, 'Sign In / Out', '/sign-in-out'),
      DrawerItem(Icons.event_available_outlined, 'Team Attendance', '/corporate-attendance'),
      DrawerItem(Icons.access_time_outlined, 'Shifts', '/shifts'),
      DrawerItem(Icons.event_note_outlined, 'Leave', '/manager/leave-requests'),
      DrawerItem(Icons.school_outlined, 'Training & Assessments', '/reports'),
      DrawerItem(Icons.receipt_long_outlined, 'Timesheets', '/manager/timesheets'),
      DrawerItem(Icons.attach_money_outlined, 'Expenses', '/expenses'),
      DrawerItem(Icons.inventory_2_outlined, 'Assets', '/reports'),
      DrawerItem(Icons.trending_up_outlined, 'Performance', '/performance'),
      DrawerItem(Icons.business_outlined, 'Branches', '/admin/branches'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'INSIGHTS', items: [
      DrawerItem(Icons.assessment_outlined, 'Reports', '/reports'),
      DrawerItem(Icons.history_outlined, 'Audit Logs', '/reports'),
    ]),
    DrawerSection(header: 'SUPPORT', items: [
      DrawerItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      DrawerItem(Icons.person_outlined, 'My Profile', '/profile'),
      DrawerItem(Icons.help_outline, 'FAQ Center', '/faq'),
      DrawerItem(Icons.phone_outlined, 'Contact Us', '/contact'),
      DrawerItem(Icons.info_outline, 'About', '/about'),
    ]),
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final screens = const [
      ManagerHomeScreen(),
      ManagerEmployeesScreen(),
      ManagerLeaveScreen(),
      TimesheetsScreen(),
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
                color: _color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'Manager Portal',
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
                  (user?.name ?? 'M').substring(0, 1).toUpperCase(),
                  style: TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
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
        portalTitle: 'Manager Portal',
        accentColor: _color,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: 'Manager',
        institutionCode: user?.institutionCode ?? '',
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
        unselectedItemColor: DiklyColors.textLight,
        backgroundColor: DiklyColors.surface,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        items: List.generate(4, (i) => BottomNavigationBarItem(icon: Icon(_icons[i]), label: _labels[i])),
      ),
    );
  }
}
