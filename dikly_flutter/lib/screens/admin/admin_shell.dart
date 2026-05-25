import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
          Builder(builder: (ctx) => IconButton(icon: const Icon(Icons.menu_outlined), onPressed: () => Scaffold.of(ctx).openEndDrawer())),
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
      endDrawer: _AdminDrawer(),
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

class _AdminDrawer extends StatelessWidget {
  void _go(BuildContext context, String route) {
    Navigator.pop(context);
    context.push(route);
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(0xFFDC2626), Color(0xFF7C3AED)])),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
                Text('DIKLY Admin', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                Text('Administration Panel', style: TextStyle(color: Colors.white70, fontSize: 13)),
              ]),
            ),
            _section('ACADEMIC'),
            _tile(context, Icons.play_circle_outline, 'Sessions', '/sessions'),
            _tile(context, Icons.schedule_outlined, 'Timetable', '/timetable'),
            _tile(context, Icons.quiz_outlined, 'Quizzes', '/quizzes'),
            _tile(context, Icons.grade_outlined, 'Gradebook', '/gradebook'),
            _tile(context, Icons.assignment_outlined, 'Assignments', '/assignments'),
            _tile(context, Icons.campaign_outlined, 'Announcements', '/announcements'),
            _section('WORKFORCE'),
            _tile(context, Icons.login_outlined, 'Sign In / Out', '/sign-in-out'),
            _tile(context, Icons.event_available_outlined, 'Attendance', '/corporate-attendance'),
            _tile(context, Icons.calendar_month_outlined, 'Shifts', '/shifts'),
            _tile(context, Icons.time_to_leave_outlined, 'Leave Requests', '/manager/leave-requests'),
            _tile(context, Icons.receipt_long_outlined, 'Timesheets', '/manager/timesheets'),
            _tile(context, Icons.attach_money_outlined, 'Expenses', '/expenses'),
            _tile(context, Icons.trending_up_outlined, 'Performance', '/performance'),
            _tile(context, Icons.business_outlined, 'Branches', '/admin/branches'),
            _section('COMMUNICATE'),
            _tile(context, Icons.message_outlined, 'Messages', '/messages'),
            _tile(context, Icons.video_call_outlined, 'Meetings', '/meetings'),
            _section('SYSTEM'),
            _tile(context, Icons.history_outlined, 'Audit Logs', '/admin/audit-logs'),
            _tile(context, Icons.card_membership_outlined, 'Subscription', '/subscription'),
            _tile(context, Icons.help_outline, 'FAQ & Help', '/faq'),
            _tile(context, Icons.person_outline, 'My Profile', '/profile'),
          ],
        ),
      ),
    );
  }

  Widget _section(String label) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
    child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textSecondary, letterSpacing: 0.8)),
  );

  Widget _tile(BuildContext context, IconData icon, String label, String route) => ListTile(
    leading: Icon(icon, size: 20, color: DiklyColors.textSecondary),
    title: Text(label, style: const TextStyle(fontSize: 14)),
    onTap: () => _go(context, route),
    dense: true,
  );
}
