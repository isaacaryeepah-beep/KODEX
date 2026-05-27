import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
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
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  static const _color = Color(0xFF7C2D12);
  static const _labels = ['Home', 'Department', 'Staff', 'Reports'];
  static const _icons = [
    Icons.home_outlined,
    Icons.school_outlined,
    Icons.people_outlined,
    Icons.bar_chart_outlined,
  ];

  void _closeDrawerThenPush(String route) {
    Navigator.pop(context);
    context.push(route);
  }

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
        title: Row(children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF7C2D12), Color(0xFFB45309)],
              ),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: Text(
                'H',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(_labels[_index]),
        ]),
        actions: [
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _color.withOpacity(0.12),
                child: Text(
                  (user?.name ?? 'H').substring(0, 1).toUpperCase(),
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
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      user?.email ?? '',
                      style: const TextStyle(
                        fontSize: 12,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: _color.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        (user?.role ?? 'hod').toUpperCase(),
                        style: const TextStyle(
                          fontSize: 10,
                          color: _color,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: Row(children: [
                  Icon(Icons.logout, size: 18, color: DiklyColors.error),
                  SizedBox(width: 10),
                  Text(
                    'Sign Out',
                    style: TextStyle(color: DiklyColors.error),
                  ),
                ]),
              ),
            ],
            onSelected: (v) async {
              if (v == 'logout') {
                await ref.read(authProvider.notifier).logout();
              }
            },
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: _color.withOpacity(0.12),
                      child: Text(
                        (user?.name ?? 'H').substring(0, 1).toUpperCase(),
                        style: const TextStyle(
                          color: _color,
                          fontWeight: FontWeight.w800,
                          fontSize: 22,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      user?.name ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      user?.email ?? '',
                      style: const TextStyle(
                        fontSize: 12,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: _color.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'HEAD OF DEPARTMENT',
                        style: TextStyle(
                          fontSize: 10,
                          color: _color,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    _DrawerItem(
                      icon: Icons.check_circle_outline,
                      label: 'Approvals',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/hod/approvals'),
                    ),
                    _DrawerItem(
                      icon: Icons.book_outlined,
                      label: 'Course Approvals',
                      color: _color,
                      onTap:
                          () => _closeDrawerThenPush('/hod/course-approvals'),
                    ),
                    _DrawerItem(
                      icon: Icons.lock_outlined,
                      label: 'Locked Students',
                      color: _color,
                      onTap:
                          () => _closeDrawerThenPush('/hod/locked-students'),
                    ),
                    _DrawerItem(
                      icon: Icons.warning_amber_outlined,
                      label: 'Smart Alerts',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/hod/alerts'),
                    ),
                    _DrawerItem(
                      icon: Icons.message_outlined,
                      label: 'Messages',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/messages'),
                    ),
                    _DrawerItem(
                      icon: Icons.video_call_outlined,
                      label: 'Meetings',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/meetings'),
                    ),
                    _DrawerItem(
                      icon: Icons.campaign_outlined,
                      label: 'Announcements',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/announcements'),
                    ),
                    _DrawerItem(
                      icon: Icons.bar_chart_outlined,
                      label: 'Performance',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/hod/performance'),
                    ),
                    _DrawerItem(
                      icon: Icons.person_outlined,
                      label: 'Profile',
                      color: _color,
                      onTap: () => _closeDrawerThenPush('/profile'),
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
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
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

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color, size: 22),
      title: Text(
        label,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
      onTap: onTap,
      dense: true,
    );
  }
}
