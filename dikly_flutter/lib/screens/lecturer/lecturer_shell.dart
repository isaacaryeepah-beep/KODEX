import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import 'lecturer_home_screen.dart';
import 'lecturer_meetings_screen.dart';
import 'lecturer_courses_screen.dart';
import 'lecturer_attendance_screen.dart';

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

  static const _labels = ['Home', 'Meetings', 'Courses', 'Attendance'];
  static const _icons = [Icons.home_outlined, Icons.video_call_outlined, Icons.book_outlined, Icons.checklist_outlined];
  static const _color = Color(0xFF7C3AED);

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final screens = const [LecturerHomeScreen(), LecturerMeetingsScreen(), LecturerCoursesScreen(), LecturerAttendanceScreen()];

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
