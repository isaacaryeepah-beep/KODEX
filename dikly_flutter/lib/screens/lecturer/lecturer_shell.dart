import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import 'lecturer_home_screen.dart';
import 'lecturer_courses_screen.dart';
import 'lecturer_attendance_screen.dart';
import '../sessions/sessions_screen.dart';

class LecturerShell extends ConsumerStatefulWidget {
  final int initialTab;
  const LecturerShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<LecturerShell> createState() => _LecturerShellState();
}

class _LecturerShellState extends ConsumerState<LecturerShell> {
  late int _index;

  @override
  void initState() { super.initState(); _index = widget.initialTab; }

  static const _labels = ['Home', 'Sessions', 'Courses', 'Attendance'];
  static const _icons = [Icons.home_outlined, Icons.play_circle_outline, Icons.book_outlined, Icons.checklist_outlined];
  static const _color = Color(0xFF7C3AED);

  void _openMore(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _LecturerMoreSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final screens = const [LecturerHomeScreen(), SessionsScreen(), LecturerCoursesScreen(), LecturerAttendanceScreen()];

    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF2563EB)]), borderRadius: BorderRadius.circular(8)),
            child: const Center(child: Text('D', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800))),
          ),
          const SizedBox(width: 10),
          Text(_labels[_index]),
        ]),
        actions: [
          IconButton(icon: const Icon(Icons.menu_outlined), onPressed: () => _openMore(context)),
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: _color.withOpacity(0.12),
                child: Text((user?.name ?? 'L').substring(0, 1).toUpperCase(),
                    style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14)),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                if (user?.department != null)
                  Text(user!.department!, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
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

class _LecturerMoreSheet extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final items = [
      _Item(Icons.schedule_outlined, 'Timetable', '/timetable'),
      _Item(Icons.quiz_outlined, 'Quizzes', '/quizzes'),
      _Item(Icons.assignment_outlined, 'Assignments', '/assignments'),
      _Item(Icons.grade_outlined, 'Gradebook', '/gradebook'),
      _Item(Icons.play_circle_outline, 'Videos', '/course-videos/all'),
      _Item(Icons.message_outlined, 'Messages', '/messages'),
      _Item(Icons.campaign_outlined, 'Announcements', '/announcements'),
      _Item(Icons.video_call_outlined, 'Meetings', '/meetings'),
      _Item(Icons.bar_chart_outlined, 'Performance', '/lecturer/performance'),
      _Item(Icons.bar_chart, 'Reports', '/reports'),
      _Item(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      _Item(Icons.help_outline, 'FAQ & Help', '/faq'),
    ];
    return Column(mainAxisSize: MainAxisSize.min, children: [
      const SizedBox(height: 8),
      Container(width: 40, height: 4, decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2))),
      const SizedBox(height: 12),
      const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Align(alignment: Alignment.centerLeft, child: Text('More', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)))),
      const SizedBox(height: 8),
      GridView.count(
        shrinkWrap: true, crossAxisCount: 4,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        children: items.map((item) => InkWell(
          onTap: () { Navigator.pop(context); context.push(item.route); },
          borderRadius: BorderRadius.circular(12),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(width: 48, height: 48, decoration: BoxDecoration(color: const Color(0xFF7C3AED).withOpacity(0.1), borderRadius: BorderRadius.circular(12)), child: Icon(item.icon, color: const Color(0xFF7C3AED), size: 22)),
            const SizedBox(height: 6),
            Text(item.label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500), maxLines: 2),
          ]),
        )).toList(),
      ),
      const SizedBox(height: 16),
    ]);
  }
}

class _Item {
  final IconData icon; final String label; final String route;
  const _Item(this.icon, this.label, this.route);
}
