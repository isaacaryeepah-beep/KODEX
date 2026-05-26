import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import 'student_home_screen.dart';
import 'student_assignments_screen.dart';
import 'student_courses_screen.dart';
import '../attendance/attendance_screen.dart';

class StudentShell extends ConsumerStatefulWidget {
  final int initialTab;
  const StudentShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<StudentShell> createState() => _StudentShellState();
}

class _StudentShellState extends ConsumerState<StudentShell> {
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialTab;
  }

  static const _labels = ['Home', 'Courses', 'Attendance', 'Assignments'];
  static const _icons = [
    Icons.home_outlined,
    Icons.book_outlined,
    Icons.check_circle_outline,
    Icons.assignment_outlined,
  ];

  void _openMore(BuildContext context) {
    final user = ref.read(authProvider).user;
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _MoreSheet(user: user),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;

    final screens = [
      const StudentHomeScreen(),
      const StudentCoursesScreen(),
      const AttendanceScreen(),
      const StudentAssignmentsScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [DiklyColors.primary, Color(0xFF7C3AED)]),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(child: Text('D', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800))),
          ),
          const SizedBox(width: 10),
          Text(_labels[_index]),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.menu_outlined),
            onPressed: () => _openMore(context),
            tooltip: 'More',
          ),
          PopupMenuButton<String>(
            offset: const Offset(0, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: DiklyColors.primary.withOpacity(0.12),
                child: Text(
                  (user?.name ?? 'U').substring(0, 1).toUpperCase(),
                  style: const TextStyle(color: DiklyColors.primary, fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                if (user?.department != null) ...[
                  const SizedBox(height: 2),
                  Text(user!.department!, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                ],
              ])),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'profile', child: Row(children: [
                Icon(Icons.person_outline, size: 18),
                SizedBox(width: 10), Text('My Profile'),
              ])),
              const PopupMenuItem(value: 'logout', child: Row(children: [
                Icon(Icons.logout, size: 18, color: DiklyColors.error),
                SizedBox(width: 10),
                Text('Sign Out', style: TextStyle(color: DiklyColors.error)),
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
        selectedItemColor: DiklyColors.primary,
        items: List.generate(4, (i) => BottomNavigationBarItem(icon: Icon(_icons[i]), label: _labels[i])),
      ),
    );
  }
}

class _MoreSheet extends StatelessWidget {
  final dynamic user;
  const _MoreSheet({this.user});

  @override
  Widget build(BuildContext context) {
    final items = [
      _MoreItem(Icons.schedule_outlined, 'Schedule', '/timetable'),
      _MoreItem(Icons.quiz_outlined, 'Quizzes', '/quizzes'),
      _MoreItem(Icons.grade_outlined, 'My Grades', '/gradebook'),
      _MoreItem(Icons.history_outlined, 'My Results', '/quiz-history'),
      _MoreItem(Icons.play_circle_outline, 'Course Videos', '/course-videos/all'),
      _MoreItem(Icons.message_outlined, 'Messages', '/messages'),
      _MoreItem(Icons.campaign_outlined, 'Announcements', '/announcements'),
      _MoreItem(Icons.video_call_outlined, 'Meetings', '/meetings'),
      _MoreItem(Icons.card_membership_outlined, 'Subscription', '/subscription'),
      _MoreItem(Icons.help_outline, 'FAQ & Help', '/faq'),
      _MoreItem(Icons.person_outline, 'My Profile', '/profile'),
    ];

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        Container(width: 40, height: 4, decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 12),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Align(alignment: Alignment.centerLeft, child: Text('More', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
        ),
        const SizedBox(height: 8),
        GridView.count(
          shrinkWrap: true,
          crossAxisCount: 4,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          children: items.map((item) => InkWell(
            onTap: () { Navigator.pop(context); context.push(item.route); },
            borderRadius: BorderRadius.circular(12),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                child: Icon(item.icon, color: DiklyColors.primary, size: 22),
              ),
              const SizedBox(height: 6),
              Text(item.label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500), maxLines: 2),
            ]),
          )).toList(),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _MoreItem {
  final IconData icon;
  final String label;
  final String route;
  const _MoreItem(this.icon, this.label, this.route);
}
