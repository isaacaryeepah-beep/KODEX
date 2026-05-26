import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
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
  static const _color = Color(0xFF0369A1);

  static const _labels = ['Home', 'Attendance', 'Leave', 'More'];
  static const _icons = [
    Icons.home_outlined,
    Icons.check_circle_outline,
    Icons.calendar_today_outlined,
    Icons.menu_outlined,
  ];

  @override
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  void _onTabTap(int i) {
    if (i == 3) {
      _showMoreSheet();
    } else {
      setState(() => _index = i);
    }
  }

  void _showMoreSheet() {
    final items = [
      _MoreItem(icon: Icons.access_time_outlined, label: 'My Shift', route: '/employee/shift'),
      _MoreItem(icon: Icons.receipt_long_outlined, label: 'Expenses', route: '/expenses'),
      _MoreItem(icon: Icons.chat_bubble_outline, label: 'Messages', route: '/messages'),
      _MoreItem(icon: Icons.video_call_outlined, label: 'Meetings', route: '/meetings'),
      _MoreItem(icon: Icons.campaign_outlined, label: 'Announcements', route: '/announcements'),
      _MoreItem(icon: Icons.bar_chart_outlined, label: 'Performance', route: '/performance'),
      _MoreItem(icon: Icons.assessment_outlined, label: 'Reports', route: '/reports'),
      _MoreItem(icon: Icons.card_membership_outlined, label: 'Subscription', route: '/subscription'),
      _MoreItem(icon: Icons.person_outline, label: 'Profile', route: '/profile'),
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: DiklyColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'More Options',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.textPrimary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 0.85,
              ),
              itemCount: items.length,
              itemBuilder: (ctx, i) {
                final item = items[i];
                return GestureDetector(
                  onTap: () {
                    Navigator.pop(ctx);
                    context.push(item.route);
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: _color.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(item.icon, color: _color, size: 24),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        item.label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          color: DiklyColors.textPrimary,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
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
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF0369A1), Color(0xFF2563EB)],
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text(
                  'D',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(tabTitle),
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
                  style: const TextStyle(
                    color: _color,
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
                      style: const TextStyle(
                        fontSize: 12,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                    if (user?.role != null)
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: _color.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          user!.role.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: _color,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'profile',
                child: Row(children: [
                  Icon(Icons.person_outline, size: 18, color: DiklyColors.textSecondary),
                  SizedBox(width: 10),
                  Text('Profile'),
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
              if (v == 'logout') {
                await ref.read(authProvider.notifier).logout();
              } else if (v == 'profile') {
                context.push('/profile');
              }
            },
          ),
        ],
      ),
      drawer: Drawer(
        backgroundColor: DiklyColors.surface,
        child: SafeArea(
          child: Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF0369A1), Color(0xFF2563EB)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: Colors.white.withOpacity(0.2),
                      child: Text(
                        (user?.name ?? 'E').substring(0, 1).toUpperCase(),
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
                            user?.name ?? '',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          Text(
                            user?.email ?? '',
                            style: const TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  children: [
                    _DrawerItem(
                      icon: Icons.chat_bubble_outline,
                      label: 'Messages',
                      onTap: () {
                        Navigator.pop(context);
                        context.push('/messages');
                      },
                    ),
                    _DrawerItem(
                      icon: Icons.video_call_outlined,
                      label: 'Meetings',
                      onTap: () {
                        Navigator.pop(context);
                        context.push('/meetings');
                      },
                    ),
                    _DrawerItem(
                      icon: Icons.campaign_outlined,
                      label: 'Announcements',
                      onTap: () {
                        Navigator.pop(context);
                        context.push('/announcements');
                      },
                    ),
                    _DrawerItem(
                      icon: Icons.assessment_outlined,
                      label: 'Reports',
                      onTap: () {
                        Navigator.pop(context);
                        context.push('/reports');
                      },
                    ),
                    _DrawerItem(
                      icon: Icons.person_outline,
                      label: 'Profile',
                      onTap: () {
                        Navigator.pop(context);
                        context.push('/profile');
                      },
                    ),
                    const Divider(),
                    _DrawerItem(
                      icon: Icons.logout,
                      label: 'Sign Out',
                      color: DiklyColors.error,
                      onTap: () async {
                        Navigator.pop(context);
                        await ref.read(authProvider.notifier).logout();
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      body: IndexedStack(
        index: _index < 3 ? _index : 0,
        children: screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index < 3 ? _index : 3,
        onTap: _onTabTap,
        selectedItemColor: _color,
        items: List.generate(
          4,
          (i) => BottomNavigationBarItem(
            icon: Icon(_icons[i]),
            label: _labels[i],
          ),
        ),
      ),
    );
  }
}

class _MoreItem {
  final IconData icon;
  final String label;
  final String route;
  const _MoreItem({required this.icon, required this.label, required this.route});
}

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? DiklyColors.textPrimary;
    return ListTile(
      leading: Icon(icon, color: c, size: 22),
      title: Text(
        label,
        style: TextStyle(color: c, fontSize: 14, fontWeight: FontWeight.w500),
      ),
      onTap: onTap,
    );
  }
}
