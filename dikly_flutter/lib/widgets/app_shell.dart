import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth.dart';
import '../core/theme.dart';
import '../models/user.dart';

class NavItem {
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final String route;

  const NavItem({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.route,
  });
}

List<NavItem> _getNavItems(String role) {
  switch (role) {
    case 'student':
      return const [
        NavItem(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home, route: '/dashboard/student'),
        NavItem(label: 'Sessions', icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/sessions'),
        NavItem(label: 'Courses', icon: Icons.school_outlined, selectedIcon: Icons.school, route: '/courses'),
        NavItem(label: 'Attendance', icon: Icons.fact_check_outlined, selectedIcon: Icons.fact_check, route: '/attendance'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
    case 'lecturer':
      return const [
        NavItem(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home, route: '/dashboard/lecturer'),
        NavItem(label: 'Sessions', icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/sessions'),
        NavItem(label: 'Courses', icon: Icons.school_outlined, selectedIcon: Icons.school, route: '/courses'),
        NavItem(label: 'Assignments', icon: Icons.assignment_outlined, selectedIcon: Icons.assignment, route: '/assignments'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
    case 'manager':
      return const [
        NavItem(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home, route: '/dashboard/manager'),
        NavItem(label: 'Team', icon: Icons.group_outlined, selectedIcon: Icons.group, route: '/manager/team'),
        NavItem(label: 'Leave', icon: Icons.event_note_outlined, selectedIcon: Icons.event_note, route: '/manager/leave-requests'),
        NavItem(label: 'Meetings', icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/meetings'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
    case 'admin':
    case 'hod':
      return const [
        NavItem(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home, route: '/dashboard/admin'),
        NavItem(label: 'Users', icon: Icons.people_outlined, selectedIcon: Icons.people, route: '/admin/users'),
        NavItem(label: 'Courses', icon: Icons.school_outlined, selectedIcon: Icons.school, route: '/courses'),
        NavItem(label: 'Meetings', icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/meetings'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
    default:
      return const [
        NavItem(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home, route: '/dashboard/student'),
        NavItem(label: 'Messages', icon: Icons.message_outlined, selectedIcon: Icons.message, route: '/messages'),
      ];
  }
}

List<NavItem> _getDrawerItems(String role) {
  final baseItems = _getNavItems(role);
  final extraItems = <NavItem>[];

  switch (role) {
    case 'student':
      extraItems.addAll([
        const NavItem(label: 'Assignments', icon: Icons.assignment_outlined, selectedIcon: Icons.assignment, route: '/assignments'),
        const NavItem(label: 'Quizzes', icon: Icons.quiz_outlined, selectedIcon: Icons.quiz, route: '/quizzes'),
        const NavItem(label: 'Grade Book', icon: Icons.grade_outlined, selectedIcon: Icons.grade, route: '/gradebook'),
        const NavItem(label: 'Meetings', icon: Icons.groups_outlined, selectedIcon: Icons.groups, route: '/meetings'),
        const NavItem(label: 'Announcements', icon: Icons.campaign_outlined, selectedIcon: Icons.campaign, route: '/announcements'),
      ]);
      break;
    case 'lecturer':
      extraItems.addAll([
        const NavItem(label: 'Attendance', icon: Icons.fact_check_outlined, selectedIcon: Icons.fact_check, route: '/attendance'),
        const NavItem(label: 'Quizzes', icon: Icons.quiz_outlined, selectedIcon: Icons.quiz, route: '/quizzes'),
        const NavItem(label: 'Grade Book', icon: Icons.grade_outlined, selectedIcon: Icons.grade, route: '/gradebook'),
        const NavItem(label: 'Meetings', icon: Icons.groups_outlined, selectedIcon: Icons.groups, route: '/meetings'),
        const NavItem(label: 'Reports', icon: Icons.bar_chart_outlined, selectedIcon: Icons.bar_chart, route: '/reports'),
        const NavItem(label: 'Announcements', icon: Icons.campaign_outlined, selectedIcon: Icons.campaign, route: '/announcements'),
      ]);
      break;
    case 'manager':
      extraItems.addAll([
        const NavItem(label: 'Timesheets', icon: Icons.schedule_outlined, selectedIcon: Icons.schedule, route: '/manager/timesheets'),
        const NavItem(label: 'Reports', icon: Icons.bar_chart_outlined, selectedIcon: Icons.bar_chart, route: '/reports'),
        const NavItem(label: 'Announcements', icon: Icons.campaign_outlined, selectedIcon: Icons.campaign, route: '/announcements'),
      ]);
      break;
    case 'admin':
    case 'hod':
      extraItems.addAll([
        const NavItem(label: 'Sessions', icon: Icons.video_call_outlined, selectedIcon: Icons.video_call, route: '/sessions'),
        const NavItem(label: 'Reports', icon: Icons.bar_chart_outlined, selectedIcon: Icons.bar_chart, route: '/reports'),
        const NavItem(label: 'Announcements', icon: Icons.campaign_outlined, selectedIcon: Icons.campaign, route: '/announcements'),
      ]);
      break;
  }
  return [...baseItems, ...extraItems];
}

class AppShell extends ConsumerWidget {
  final Widget child;
  final String title;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final bool showBackButton;

  const AppShell({
    super.key,
    required this.child,
    required this.title,
    this.actions,
    this.floatingActionButton,
    this.showBackButton = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final role = user?.role ?? 'student';
    final navItems = _getNavItems(role);
    final drawerItems = _getDrawerItems(role);

    final currentRoute = GoRouterState.of(context).uri.toString();
    int selectedIndex = navItems.indexWhere((item) => currentRoute.startsWith(item.route));
    if (selectedIndex < 0) selectedIndex = 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        leading: showBackButton
            ? BackButton(onPressed: () => context.pop())
            : Builder(
                builder: (context) => IconButton(
                  icon: const Icon(Icons.menu_rounded),
                  onPressed: () => Scaffold.of(context).openDrawer(),
                ),
              ),
        actions: [
          if (actions != null) ...actions!,
          IconButton(
            icon: const Icon(Icons.person_outline_rounded),
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      drawer: _buildDrawer(context, ref, user, drawerItems, currentRoute),
      body: child,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: navItems.length > 1
          ? _buildBottomNav(context, navItems, selectedIndex)
          : null,
    );
  }

  Widget _buildDrawer(
    BuildContext context,
    WidgetRef ref,
    User? user,
    List<NavItem> items,
    String currentRoute,
  ) {
    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [DiklyColors.primary, DiklyColors.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: Colors.white.withOpacity(0.2),
                        child: Text(
                          user?.initials ?? 'U',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 18,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.name ?? 'User',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              user?.email ?? '',
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.8),
                                fontSize: 12,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      (user?.role ?? 'student').toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Nav items
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  for (final item in items)
                    ListTile(
                      leading: Icon(
                        currentRoute.startsWith(item.route)
                            ? item.selectedIcon
                            : item.icon,
                        color: currentRoute.startsWith(item.route)
                            ? DiklyColors.primary
                            : DiklyColors.textSecondary,
                        size: 22,
                      ),
                      title: Text(
                        item.label,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: currentRoute.startsWith(item.route)
                              ? FontWeight.w600
                              : FontWeight.w400,
                          color: currentRoute.startsWith(item.route)
                              ? DiklyColors.primary
                              : DiklyColors.textPrimary,
                        ),
                      ),
                      tileColor: currentRoute.startsWith(item.route)
                          ? DiklyColors.primary.withOpacity(0.08)
                          : null,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                      onTap: () {
                        Navigator.of(context).pop();
                        context.go(item.route);
                      },
                    ),
                ],
              ),
            ),
            // Bottom
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.person_outline_rounded, color: DiklyColors.textSecondary),
              title: const Text('Profile', style: TextStyle(fontSize: 14)),
              onTap: () {
                Navigator.of(context).pop();
                context.push('/profile');
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout_rounded, color: DiklyColors.error),
              title: const Text('Logout', style: TextStyle(fontSize: 14, color: DiklyColors.error)),
              onTap: () async {
                Navigator.of(context).pop();
                await ref.read(authProvider.notifier).logout();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNav(
    BuildContext context,
    List<NavItem> items,
    int selectedIndex,
  ) {
    return BottomNavigationBar(
      currentIndex: selectedIndex < 0 ? 0 : selectedIndex,
      onTap: (index) => context.go(items[index].route),
      items: items
          .map(
            (item) => BottomNavigationBarItem(
              icon: Icon(item.icon),
              activeIcon: Icon(item.selectedIcon),
              label: item.label,
            ),
          )
          .toList(),
    );
  }
}

extension UserInitials on User {
  String get initials {
    final parts = name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }
}
