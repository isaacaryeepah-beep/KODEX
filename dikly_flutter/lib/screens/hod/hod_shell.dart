import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
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
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  static const _color = Color(0xFF0891B2); // HOD teal accent

  static const _labels = ['Home', 'Courses', 'Staff', 'Reports'];
  static const _icons = [
    Icons.home_outlined,
    Icons.book_outlined,
    Icons.people_outlined,
    Icons.bar_chart_outlined,
  ];

  static const _sections = [
    DrawerSection(items: [
      DrawerItem(Icons.dashboard_outlined, 'Dashboard', '/dashboard/hod'),
    ]),
    DrawerSection(header: 'DEPARTMENT', items: [
      DrawerItem(Icons.grid_view_outlined, 'Overview', '/dashboard/hod'),
      DrawerItem(Icons.play_circle_outline, 'Sessions', '/hod/sessions'),
      DrawerItem(Icons.book_outlined, 'Courses', '/courses'),
      DrawerItem(Icons.schedule_outlined, 'Timetable', '/timetable'),
      DrawerItem(Icons.person_outlined, 'Lecturers', '/hod/lecturers'),
      DrawerItem(Icons.people_outlined, 'Students', '/hod/students'),
    ]),
    DrawerSection(header: 'INSIGHTS', items: [
      DrawerItem(Icons.bar_chart_outlined, 'Performance', '/hod/performance'),
      DrawerItem(Icons.visibility_outlined, 'Quiz Monitor', '/hod/quiz-monitor'),
      DrawerItem(Icons.warning_amber_outlined, 'Smart Alerts', '/hod/alerts'),
      DrawerItem(Icons.assessment_outlined, 'Reports', '/hod/reports'),
    ]),
    DrawerSection(header: 'COMMUNICATE', items: [
      DrawerItem(Icons.forum_outlined, 'Dept. Messaging', '/hod/dept-messaging'),
      DrawerItem(Icons.message_outlined, 'Messages', '/messages'),
      DrawerItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
      DrawerItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
    ]),
    DrawerSection(header: 'MANAGE', items: [
      DrawerItem(Icons.check_circle_outline, 'Approvals', '/hod/approvals'),
      DrawerItem(Icons.task_alt_outlined, 'Course Approvals', '/hod/course-approvals'),
      DrawerItem(Icons.lock_open_outlined, 'Unlock Students', '/hod/locked-students'),
      DrawerItem(Icons.devices_outlined, 'Classroom Devices', '/admin/devices'),
      DrawerItem(Icons.supervisor_account_outlined, 'Class Representatives', '/admin/class-reps'),
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
      HodHomeScreen(),
      HodCoursesScreen(),
      HodLecturersScreen(),
      HodReportsScreen(),
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
            icon: const Icon(Icons.menu_outlined, color: DiklyColors.text),
            onPressed: () => _scaffoldKey.currentState?.openDrawer(),
          ),
        ),
        title: Text(
          'HOD Portal',
          style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.text),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: DiklyColors.border),
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
                backgroundColor: _color.withOpacity(0.12),
                child: Text(
                  (user?.name ?? 'H').substring(0, 1).toUpperCase(),
                  style: GoogleFonts.dmSans(color: _color, fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.name ?? '', style: GoogleFonts.dmSans(fontWeight: FontWeight.w700, fontSize: 14, color: DiklyColors.text)),
                    Text(user?.email ?? '', style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight)),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: _color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                      child: Text('HOD', style: GoogleFonts.dmSans(fontSize: 10, color: _color, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
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
                  Text('Sign Out', style: GoogleFonts.dmSans(fontSize: 14, color: DiklyColors.error)),
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
        backgroundColor: DiklyColors.surface,
        selectedItemColor: _color,
        unselectedItemColor: DiklyColors.textLight,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w400),
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        items: List.generate(4, (i) => BottomNavigationBarItem(
          icon: Icon(_icons[i]),
          label: _labels[i],
        )),
      ),
    );
  }
}
