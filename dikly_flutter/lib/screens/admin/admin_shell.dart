import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
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

  static const _labels = ['Home', 'Users', 'Courses', 'Reports'];
  static const _icons = [Icons.home_outlined, Icons.people_outlined, Icons.book_outlined, Icons.bar_chart_outlined];
  static const _color = Color(0xFFDC2626);

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final screens = const [AdminHomeScreen(), AdminUsersScreen(), AdminCoursesScreen(), AdminReportsScreen()];

    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFDC2626), Color(0xFF7C3AED)]), borderRadius: BorderRadius.circular(8)),
            child: const Center(child: Text('D', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800))),
          ),
          const SizedBox(width: 10),
          Text(_labels[_index]),
        ]),
        actions: [
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _color.withOpacity(0.12),
                child: Text((user?.name ?? 'A').substring(0, 1).toUpperCase(),
                    style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14)),
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
              const PopupMenuItem(value: 'logout', child: Row(children: [
                Icon(Icons.logout, size: 18, color: DiklyColors.error),
                SizedBox(width: 10),
                Text('Sign Out', style: TextStyle(color: DiklyColors.error)),
              ])),
            ],
            onSelected: (v) async { if (v == 'logout') await ref.read(authProvider.notifier).logout(); },
          ),
        ],
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
