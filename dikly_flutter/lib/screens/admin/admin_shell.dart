import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
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
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  static const _accent = Color(0xFFDC2626); // Admin red accent
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
    DrawerSection(header: 'MANAGE', items: [
      DrawerItem(Icons.check_circle_outline, 'Approvals', '/admin/approvals'),
      DrawerItem(Icons.search_outlined, 'Search', '/admin/search'),
      DrawerItem(Icons.people_outlined, 'Users', '/admin/users'),
      DrawerItem(Icons.play_circle_outline, 'Sessions', '/admin/sessions'),
    ]),
    DrawerSection(header: 'ACADEMIC', items: [
      DrawerItem(Icons.book_outlined, 'Courses', '/courses'),
      DrawerItem(Icons.task_alt_outlined, 'Course Approvals', '/admin/course-approvals'),
      DrawerItem(Icons.shield_outlined, 'Proctored/Snap Quiz', '/admin/quizzes'),
      DrawerItem(Icons.grade_outlined, 'Grade Book', '/gradebook'),
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
      DrawerItem(Icons.school_outlined, 'Programmes', '/admin/programmes'),
      DrawerItem(Icons.lock_open_outlined, 'Unlock Students', '/admin/unlock-students'),
      DrawerItem(Icons.people_alt_outlined, 'Class Reps', '/admin/class-reps'),
      DrawerItem(Icons.devices_outlined, 'Classroom Devices', '/admin/devices'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
    ]),
    DrawerSection(header: 'INSIGHTS', items: [
      DrawerItem(Icons.assessment_outlined, 'Reports', '/admin/reports'),
    ]),
    DrawerSection(header: 'SUPPORT', items: [
      DrawerItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      DrawerItem(Icons.person_outlined, 'Profile', '/profile'),
      DrawerItem(Icons.help_outline, 'FAQ Center', '/faq'),
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
              'Admin Portal',
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
            offset: const Offset(0, 52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            color: DiklyColors.surface,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _accent.withOpacity(0.12),
                child: Text(
                  (user?.name ?? 'A').substring(0, 1).toUpperCase(),
                  style: GoogleFonts.dmSans(
                    color: _accent,
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
                      style: GoogleFonts.dmSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: DiklyColors.text,
                      ),
                    ),
                    Text(
                      user?.email ?? '',
                      style: GoogleFonts.dmSans(
                        fontSize: 12,
                        color: DiklyColors.textLight,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: _accent.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        (user?.role ?? 'admin').toUpperCase(),
                        style: GoogleFonts.dmSans(
                          fontSize: 10,
                          color: _accent,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              PopupMenuItem(
                value: 'profile',
                child: Row(children: [
                  const Icon(Icons.person_outline, size: 18, color: DiklyColors.textSecondary),
                  const SizedBox(width: 10),
                  Text('My Profile', style: GoogleFonts.dmSans(fontSize: 14)),
                ]),
              ),
              PopupMenuItem(
                value: 'logout',
                child: Row(children: [
                  const Icon(Icons.logout, size: 18, color: DiklyColors.error),
                  const SizedBox(width: 10),
                  Text(
                    'Sign Out',
                    style: GoogleFonts.dmSans(fontSize: 14, color: DiklyColors.error),
                  ),
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
        portalTitle: 'Admin Portal',
        accentColor: _accent,
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
        backgroundColor: DiklyColors.surface,
        selectedItemColor: _accent,
        unselectedItemColor: DiklyColors.textLight,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w400),
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        items: List.generate(
          4,
          (i) => BottomNavigationBarItem(icon: Icon(_icons[i]), label: _labels[i]),
        ),
      ),
    );
  }
}
