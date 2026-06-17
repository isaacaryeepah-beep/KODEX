import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/auth.dart';
import '../core/theme.dart';
import '../models/user.dart';

// ── Role color / label helpers ────────────────────────────────────────────────

Color _roleColor(String role) {
  switch (role) {
    case 'lecturer': return const Color(0xFFD97706);
    case 'admin':    return const Color(0xFFDC2626);
    case 'hod':      return const Color(0xFF0891B2);
    case 'manager':  return const Color(0xFF1D4ED8);
    case 'employee': return const Color(0xFF059669);
    default:         return const Color(0xFF7C3AED); // student
  }
}

String _roleLabel(String role) {
  switch (role) {
    case 'lecturer': return 'Lecturer Portal';
    case 'admin':    return 'Admin Portal';
    case 'hod':      return 'HOD Portal';
    case 'manager':  return 'Manager Portal';
    case 'employee': return 'Employee Portal';
    default:         return 'Student Portal';
  }
}

// ── Nav item ──────────────────────────────────────────────────────────────────

class NavItem {
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final String route;
  final String? section; // non-null = print a section header above this item

  const NavItem({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.route,
    this.section,
  });
}

// ── Drawer nav per role ───────────────────────────────────────────────────────

List<NavItem> _drawerItems(String role) {
  switch (role) {
    case 'student':
      return const [
        NavItem(label: 'Home',            icon: Icons.home_outlined,            selectedIcon: Icons.home,                  route: '/dashboard/student'),
        NavItem(label: 'Mark Attendance', icon: Icons.qr_code_scanner_outlined, selectedIcon: Icons.qr_code_scanner_rounded, route: '/attendance',        section: 'ATTENDANCE'),
        NavItem(label: 'My Attendance',   icon: Icons.fact_check_outlined,      selectedIcon: Icons.fact_check,            route: '/attendance'),
        NavItem(label: 'My Courses',      icon: Icons.school_outlined,          selectedIcon: Icons.school,                route: '/courses',           section: 'ACADEMIC'),
        NavItem(label: 'Timetable',       icon: Icons.calendar_today_outlined,  selectedIcon: Icons.calendar_today,        route: '/timetable'),
        NavItem(label: 'Proctored Quiz',  icon: Icons.quiz_outlined,            selectedIcon: Icons.quiz,                  route: '/quizzes'),
        NavItem(label: 'Assignments',     icon: Icons.assignment_outlined,      selectedIcon: Icons.assignment,            route: '/assignments'),
        NavItem(label: 'My Grades',       icon: Icons.grade_outlined,           selectedIcon: Icons.grade,                 route: '/gradebook'),
        NavItem(label: 'My Results',      icon: Icons.bar_chart_outlined,       selectedIcon: Icons.bar_chart,             route: '/reports'),
        NavItem(label: 'Course Videos',   icon: Icons.play_circle_outline,      selectedIcon: Icons.play_circle,           route: '/courses',           section: 'CONTENT'),
        NavItem(label: 'Messages',        icon: Icons.message_outlined,         selectedIcon: Icons.message,               route: '/messages',          section: 'COMMUNICATE'),
        NavItem(label: 'Meetings',        icon: Icons.groups_outlined,          selectedIcon: Icons.groups,                route: '/meetings'),
        NavItem(label: 'Announcements',   icon: Icons.campaign_outlined,        selectedIcon: Icons.campaign,              route: '/announcements'),
      ];
    case 'lecturer':
      return const [
        NavItem(label: 'Home',          icon: Icons.home_outlined,           selectedIcon: Icons.home,           route: '/dashboard/lecturer'),
        NavItem(label: 'Attendance',    icon: Icons.fact_check_outlined,     selectedIcon: Icons.fact_check,     route: '/attendance',       section: 'ATTENDANCE'),
        NavItem(label: 'Sessions',      icon: Icons.video_call_outlined,     selectedIcon: Icons.video_call,     route: '/sessions',         section: 'ACADEMIC'),
        NavItem(label: 'My Courses',    icon: Icons.school_outlined,         selectedIcon: Icons.school,         route: '/courses'),
        NavItem(label: 'Quizzes',       icon: Icons.quiz_outlined,           selectedIcon: Icons.quiz,           route: '/quizzes'),
        NavItem(label: 'Assignments',   icon: Icons.assignment_outlined,     selectedIcon: Icons.assignment,     route: '/assignments'),
        NavItem(label: 'Grade Book',    icon: Icons.grade_outlined,          selectedIcon: Icons.grade,          route: '/gradebook'),
        NavItem(label: 'Timetable',     icon: Icons.calendar_today_outlined, selectedIcon: Icons.calendar_today, route: '/timetable'),
        NavItem(label: 'Messages',      icon: Icons.message_outlined,        selectedIcon: Icons.message,        route: '/messages',         section: 'COMMUNICATE'),
        NavItem(label: 'Meetings',      icon: Icons.groups_outlined,         selectedIcon: Icons.groups,         route: '/meetings'),
        NavItem(label: 'Announcements', icon: Icons.campaign_outlined,       selectedIcon: Icons.campaign,       route: '/announcements'),
        NavItem(label: 'Reports',       icon: Icons.bar_chart_outlined,      selectedIcon: Icons.bar_chart,      route: '/reports'),
      ];
    case 'hod':
      return const [
        NavItem(label: 'Home',             icon: Icons.home_outlined,                  selectedIcon: Icons.home,                 route: '/dashboard/hod'),
        NavItem(label: 'Approvals',        icon: Icons.pending_actions_outlined,       selectedIcon: Icons.pending_actions,      route: '/hod/approvals',       section: 'MANAGEMENT'),
        NavItem(label: 'Course Approvals', icon: Icons.school_outlined,               selectedIcon: Icons.school,               route: '/hod/course-approvals'),
        NavItem(label: 'Lecturers',        icon: Icons.people_outlined,               selectedIcon: Icons.people,               route: '/hod/lecturers'),
        NavItem(label: 'Students',         icon: Icons.person_outlined,               selectedIcon: Icons.person,               route: '/hod/locked-students'),
        NavItem(label: 'Sessions',         icon: Icons.video_call_outlined,           selectedIcon: Icons.video_call,           route: '/sessions',            section: 'ACADEMIC'),
        NavItem(label: 'Reports',          icon: Icons.bar_chart_outlined,            selectedIcon: Icons.bar_chart,            route: '/reports'),
        NavItem(label: 'Smart Alerts',     icon: Icons.notifications_active_outlined, selectedIcon: Icons.notifications_active, route: '/hod/alerts'),
        NavItem(label: 'Messages',         icon: Icons.message_outlined,              selectedIcon: Icons.message,              route: '/messages',            section: 'COMMUNICATE'),
        NavItem(label: 'Announcements',    icon: Icons.campaign_outlined,             selectedIcon: Icons.campaign,             route: '/announcements'),
      ];
    case 'admin':
      return const [
        NavItem(label: 'Home',          icon: Icons.home_outlined,         selectedIcon: Icons.home,         route: '/dashboard/admin'),
        NavItem(label: 'Users',         icon: Icons.people_outlined,       selectedIcon: Icons.people,       route: '/admin/users',      section: 'MANAGEMENT'),
        NavItem(label: 'Branches',      icon: Icons.account_tree_outlined, selectedIcon: Icons.account_tree, route: '/admin/branches'),
        NavItem(label: 'Audit Logs',    icon: Icons.history_rounded,       selectedIcon: Icons.history,      route: '/admin/audit-logs'),
        NavItem(label: 'Sessions',      icon: Icons.video_call_outlined,   selectedIcon: Icons.video_call,   route: '/sessions',         section: 'ACADEMIC'),
        NavItem(label: 'Courses',       icon: Icons.school_outlined,       selectedIcon: Icons.school,       route: '/courses'),
        NavItem(label: 'Reports',       icon: Icons.bar_chart_outlined,    selectedIcon: Icons.bar_chart,    route: '/reports'),
        NavItem(label: 'Messages',      icon: Icons.message_outlined,      selectedIcon: Icons.message,      route: '/messages',         section: 'COMMUNICATE'),
        NavItem(label: 'Announcements', icon: Icons.campaign_outlined,     selectedIcon: Icons.campaign,     route: '/announcements'),
        NavItem(label: 'Meetings',      icon: Icons.groups_outlined,       selectedIcon: Icons.groups,       route: '/meetings'),
      ];
    case 'manager':
      return const [
        NavItem(label: 'Home',            icon: Icons.home_outlined,           selectedIcon: Icons.home,           route: '/dashboard/manager'),
        NavItem(label: 'Live Attendance', icon: Icons.radio_button_checked,    selectedIcon: Icons.radio_button_checked, route: '/corporate-attendance', section: 'ATTENDANCE'),
        NavItem(label: 'Team',            icon: Icons.group_outlined,          selectedIcon: Icons.group,          route: '/manager/team',        section: 'MANAGEMENT'),
        NavItem(label: 'Leave Requests',  icon: Icons.event_note_outlined,     selectedIcon: Icons.event_note,     route: '/manager/leave-requests'),
        NavItem(label: 'Timesheets',      icon: Icons.schedule_outlined,       selectedIcon: Icons.schedule,       route: '/manager/timesheets'),
        NavItem(label: 'Shifts',          icon: Icons.access_time_outlined,    selectedIcon: Icons.access_time,    route: '/shifts'),
        NavItem(label: 'Reports',         icon: Icons.bar_chart_outlined,      selectedIcon: Icons.bar_chart,      route: '/reports'),
        NavItem(label: 'Messages',        icon: Icons.message_outlined,        selectedIcon: Icons.message,        route: '/messages',            section: 'COMMUNICATE'),
        NavItem(label: 'Meetings',        icon: Icons.groups_outlined,         selectedIcon: Icons.groups,         route: '/meetings'),
        NavItem(label: 'Announcements',   icon: Icons.campaign_outlined,       selectedIcon: Icons.campaign,       route: '/announcements'),
      ];
    case 'employee':
      return const [
        NavItem(label: 'Home',          icon: Icons.home_outlined,            selectedIcon: Icons.home,           route: '/dashboard/employee'),
        NavItem(label: 'Clock In/Out',  icon: Icons.login_outlined,           selectedIcon: Icons.login,          route: '/sign-in-out',       section: 'ATTENDANCE'),
        NavItem(label: 'My Attendance', icon: Icons.fact_check_outlined,      selectedIcon: Icons.fact_check,     route: '/corporate-attendance'),
        NavItem(label: 'My Shift',      icon: Icons.access_time_outlined,     selectedIcon: Icons.access_time,    route: '/employee/shift',    section: 'WORK'),
        NavItem(label: 'My Leaves',     icon: Icons.event_available_outlined, selectedIcon: Icons.event_available, route: '/employee/leaves'),
        NavItem(label: 'Performance',   icon: Icons.trending_up_outlined,     selectedIcon: Icons.trending_up,    route: '/performance'),
        NavItem(label: 'Messages',      icon: Icons.message_outlined,         selectedIcon: Icons.message,        route: '/messages',          section: 'COMMUNICATE'),
        NavItem(label: 'Announcements', icon: Icons.campaign_outlined,        selectedIcon: Icons.campaign,       route: '/announcements'),
      ];
    default:
      return const [
        NavItem(label: 'Home',     icon: Icons.home_outlined,    selectedIcon: Icons.home,    route: '/dashboard/student'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
  }
}

List<NavItem> _bottomItems(String role) {
  switch (role) {
    case 'student':
      return const [
        NavItem(label: 'Home',       icon: Icons.home_outlined,       selectedIcon: Icons.home,       route: '/dashboard/student'),
        NavItem(label: 'Sessions',   icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/sessions'),
        NavItem(label: 'Courses',    icon: Icons.school_outlined,     selectedIcon: Icons.school,     route: '/courses'),
        NavItem(label: 'Attendance', icon: Icons.fact_check_outlined, selectedIcon: Icons.fact_check, route: '/attendance'),
        NavItem(label: 'Messages',   icon: Icons.message_outlined,    selectedIcon: Icons.message,    route: '/messages'),
      ];
    case 'lecturer':
      return const [
        NavItem(label: 'Home',       icon: Icons.home_outlined,       selectedIcon: Icons.home,       route: '/dashboard/lecturer'),
        NavItem(label: 'Sessions',   icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/sessions'),
        NavItem(label: 'Courses',    icon: Icons.school_outlined,     selectedIcon: Icons.school,     route: '/courses'),
        NavItem(label: 'Attendance', icon: Icons.fact_check_outlined, selectedIcon: Icons.fact_check, route: '/attendance'),
        NavItem(label: 'Messages',   icon: Icons.message_outlined,    selectedIcon: Icons.message,    route: '/messages'),
      ];
    case 'manager':
      return const [
        NavItem(label: 'Home',    icon: Icons.home_outlined,       selectedIcon: Icons.home,       route: '/dashboard/manager'),
        NavItem(label: 'Team',    icon: Icons.group_outlined,      selectedIcon: Icons.group,      route: '/manager/team'),
        NavItem(label: 'Leave',   icon: Icons.event_note_outlined, selectedIcon: Icons.event_note, route: '/manager/leave-requests'),
        NavItem(label: 'Meetings',icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/meetings'),
        NavItem(label: 'Messages',icon: Icons.message_outlined,    selectedIcon: Icons.message,    route: '/messages'),
      ];
    case 'admin':
    case 'hod':
      return const [
        NavItem(label: 'Home',    icon: Icons.home_outlined,       selectedIcon: Icons.home,       route: '/dashboard/admin'),
        NavItem(label: 'Users',   icon: Icons.people_outlined,     selectedIcon: Icons.people,     route: '/admin/users'),
        NavItem(label: 'Courses', icon: Icons.school_outlined,     selectedIcon: Icons.school,     route: '/courses'),
        NavItem(label: 'Meetings',icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/meetings'),
        NavItem(label: 'Messages',icon: Icons.message_outlined,    selectedIcon: Icons.message,    route: '/messages'),
      ];
    case 'employee':
      return const [
        NavItem(label: 'Home',       icon: Icons.home_outlined,            selectedIcon: Icons.home,           route: '/dashboard/employee'),
        NavItem(label: 'Clock',      icon: Icons.login_outlined,           selectedIcon: Icons.login,          route: '/sign-in-out'),
        NavItem(label: 'Attendance', icon: Icons.fact_check_outlined,      selectedIcon: Icons.fact_check,     route: '/corporate-attendance'),
        NavItem(label: 'Leaves',     icon: Icons.event_available_outlined, selectedIcon: Icons.event_available, route: '/employee/leaves'),
        NavItem(label: 'Messages',   icon: Icons.message_outlined,         selectedIcon: Icons.message,        route: '/messages'),
      ];
    default:
      return const [
        NavItem(label: 'Home',     icon: Icons.home_outlined,    selectedIcon: Icons.home,    route: '/dashboard/student'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
  }
}

// ── AppShell ──────────────────────────────────────────────────────────────────

class AppShell extends ConsumerWidget {
  final Widget child;
  final String title;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final bool showBackButton;
  final Color? appBarColor;
  final Color? appBarForeground;

  const AppShell({
    super.key,
    required this.child,
    required this.title,
    this.actions,
    this.floatingActionButton,
    this.showBackButton = false,
    this.appBarColor,
    this.appBarForeground,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final role = user?.role ?? 'student';
    final navItems = _bottomItems(role);
    final drawer = _drawerItems(role);
    final roleColor = _roleColor(role);

    final currentRoute = GoRouterState.of(context).uri.toString();
    int selectedIndex = navItems.indexWhere((item) => currentRoute.startsWith(item.route));
    if (selectedIndex < 0) selectedIndex = 0;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: appBarColor ?? Colors.white,
        foregroundColor: appBarForeground,
        iconTheme: IconThemeData(color: appBarForeground ?? DiklyColors.text),
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                title,
                style: GoogleFonts.dmSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: appBarForeground ?? DiklyColors.text,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: roleColor.withOpacity(0.10),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: roleColor.withOpacity(0.25)),
              ),
              child: Text(
                role.toUpperCase(),
                style: GoogleFonts.dmSans(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: roleColor,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        leading: showBackButton
            ? BackButton(onPressed: () => context.pop())
            : Builder(
                builder: (ctx) => IconButton(
                  icon: const Icon(Icons.menu_rounded),
                  onPressed: () => Scaffold.of(ctx).openDrawer(),
                ),
              ),
        actions: [
          if (actions != null) ...actions!,
          IconButton(
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.person_outline_rounded),
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      drawer: _DiklyDrawer(
        user: user,
        items: drawer,
        currentRoute: currentRoute,
        roleColor: roleColor,
        role: role,
        onLogout: () async => ref.read(authProvider.notifier).logout(),
      ),
      body: child,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: navItems.length > 1
          ? _BottomNav(
              items: navItems,
              selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
              onTap: (i) => context.go(navItems[i].route),
            )
          : null,
    );
  }
}

// ── Drawer widget ─────────────────────────────────────────────────────────────

class _DiklyDrawer extends StatelessWidget {
  final User? user;
  final List<NavItem> items;
  final String currentRoute;
  final Color roleColor;
  final String role;
  final VoidCallback onLogout;

  const _DiklyDrawer({
    required this.user,
    required this.items,
    required this.currentRoute,
    required this.roleColor,
    required this.role,
    required this.onLogout,
  });

  bool _isActive(NavItem item) {
    if (item.route == '/attendance') return currentRoute == '/attendance';
    return currentRoute.startsWith(item.route);
  }

  @override
  Widget build(BuildContext context) {
    final instCode = user?.institutionCode ?? '';

    return Drawer(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(0)),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: logo + user identity
            Container(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(bottom: BorderSide(color: Color(0xFFF3F4F6))),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // DIKLY logo
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: roleColor,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'DIKLY',
                        style: GoogleFonts.dmSans(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: DiklyColors.text,
                          letterSpacing: 1.0,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // User info
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: roleColor.withOpacity(0.12),
                        child: Text(
                          user?.initials ?? 'U',
                          style: GoogleFonts.dmSans(
                            color: roleColor,
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.name ?? 'User',
                              style: GoogleFonts.dmSans(
                                color: DiklyColors.text,
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              _roleLabel(role),
                              style: GoogleFonts.dmSans(
                                color: DiklyColors.textMuted,
                                fontSize: 11,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Nav items
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                children: [
                  for (final item in items) ...[
                    if (item.section != null) ...[
                      const SizedBox(height: 10),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
                        child: Text(
                          item.section!,
                          style: GoogleFonts.dmSans(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF9CA3AF),
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    ],
                    _DrawerTile(item: item, isActive: _isActive(item)),
                  ],
                ],
              ),
            ),

            // Institution code
            if (instCode.isNotEmpty) ...[
              const Divider(height: 1, color: Color(0xFFF3F4F6)),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 10, 18, 6),
                child: Row(
                  children: [
                    Text(
                      'CODE',
                      style: GoogleFonts.dmSans(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF9CA3AF),
                        letterSpacing: 1.0,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        instCode,
                        style: GoogleFonts.dmSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.text,
                          letterSpacing: 0.5,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Profile + sign out
            const Divider(height: 1, color: Color(0xFFE5E7EB)),
            _DrawerTile(
              item: const NavItem(
                label: 'Profile',
                icon: Icons.person_outline_rounded,
                selectedIcon: Icons.person_rounded,
                route: '/profile',
              ),
              isActive: currentRoute.startsWith('/profile'),
              overrideTap: (ctx) {
                Navigator.of(ctx).pop();
                GoRouter.of(ctx).push('/profile');
              },
            ),
            Builder(builder: (ctx) {
              return InkWell(
                onTap: () {
                  Navigator.of(ctx).pop();
                  onLogout();
                },
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: ListTile(
                    leading: const Icon(Icons.logout_rounded, color: Color(0xFFDC2626), size: 20),
                    title: Text(
                      'Sign Out',
                      style: GoogleFonts.dmSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFFDC2626),
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    dense: true,
                    minLeadingWidth: 24,
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _DrawerTile extends StatelessWidget {
  final NavItem item;
  final bool isActive;
  final void Function(BuildContext)? overrideTap;

  const _DrawerTile({
    required this.item,
    required this.isActive,
    this.overrideTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: isActive
          ? BoxDecoration(
              color: const Color(0xA8FFF0B9),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.4)),
            )
          : null,
      child: ListTile(
        leading: Icon(
          isActive ? item.selectedIcon : item.icon,
          color: isActive ? const Color(0xFFB45309) : const Color(0xFF6B7280),
          size: 20,
        ),
        title: Text(
          item.label,
          style: GoogleFonts.dmSans(
            fontSize: 14,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? const Color(0xFF92400E) : DiklyColors.textSecondary,
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12),
        dense: true,
        minLeadingWidth: 24,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        onTap: overrideTap != null
            ? () => overrideTap!(context)
            : () {
                Navigator.of(context).pop();
                GoRouter.of(context).go(item.route);
              },
      ),
    );
  }
}

// ── Modern pill bottom navigation ─────────────────────────────────────────────

class _BottomNav extends StatelessWidget {
  final List<NavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onTap;

  const _BottomNav({
    required this.items,
    required this.selectedIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0xFFE5E7EB))),
        boxShadow: [BoxShadow(color: Color(0x0F000000), blurRadius: 16, offset: Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(items.length, (i) {
              final isSelected = i == selectedIndex;
              return _BottomItem(
                item: items[i],
                isSelected: isSelected,
                onTap: () => onTap(i),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _BottomItem extends StatelessWidget {
  final NavItem item;
  final bool isSelected;
  final VoidCallback onTap;

  const _BottomItem({required this.item, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: EdgeInsets.symmetric(horizontal: isSelected ? 16 : 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? DiklyColors.primary.withOpacity(0.10) : Colors.transparent,
          borderRadius: BorderRadius.circular(40),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: Icon(
                isSelected ? item.selectedIcon : item.icon,
                key: ValueKey(isSelected),
                size: 22,
                color: isSelected ? DiklyColors.primary : const Color(0xFF9CA3AF),
              ),
            ),
            AnimatedSize(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeInOut,
              child: isSelected
                  ? Row(children: [
                      const SizedBox(width: 6),
                      Text(
                        item.label,
                        style: GoogleFonts.dmSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.primary,
                        ),
                      ),
                    ])
                  : const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Extension ─────────────────────────────────────────────────────────────────

extension UserInitials on User {
  String get initials {
    final parts = name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }
}
