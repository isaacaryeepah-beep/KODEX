import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import 'manager_home_screen.dart';
import 'manager_employees_screen.dart';
import 'manager_leave_screen.dart';
import 'manager_reports_screen.dart';
import 'timesheets_screen.dart';

class ManagerShell extends ConsumerStatefulWidget {
  final int initialTab;
  const ManagerShell({super.key, this.initialTab = 0});

  @override
  ConsumerState<ManagerShell> createState() => _ManagerShellState();
}

class _ManagerShellState extends ConsumerState<ManagerShell> {
  late int _index;

  @override
  void initState() { super.initState(); _index = widget.initialTab; }

  static const _labels = ['Home', 'Team', 'Leave', 'Timesheets', 'More'];
  static const _icons = [
    Icons.home_outlined,
    Icons.people_outlined,
    Icons.event_note_outlined,
    Icons.receipt_long_outlined,
    Icons.menu_outlined,
  ];
  static const _color = Color(0xFF059669);

  void _openMore(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ManagerMoreSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;

    final screens = [
      const ManagerHomeScreen(),
      const ManagerEmployeesScreen(),
      const ManagerLeaveScreen(),
      const TimesheetsScreen(),
      // "More" tab shows a sheet instead of a screen; placeholder:
      const SizedBox.shrink(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF059669), Color(0xFF2563EB)]), borderRadius: BorderRadius.circular(8)),
            child: const Center(child: Text('D', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800))),
          ),
          const SizedBox(width: 10),
          Text(_index < 4 ? _labels[_index] : 'Manager'),
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
                child: Text((user?.name ?? 'M').substring(0, 1).toUpperCase(),
                    style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 14)),
              ),
            ),
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Text(user?.email ?? '', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
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
      body: _index == 4 ? const SizedBox.shrink() : IndexedStack(index: _index, children: screens.sublist(0, 4)),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) {
          if (i == 4) {
            _openMore(context);
          } else {
            setState(() => _index = i);
          }
        },
        selectedItemColor: _color,
        items: List.generate(5, (i) => BottomNavigationBarItem(icon: Icon(_icons[i]), label: _labels[i])),
      ),
    );
  }
}

class _ManagerMoreSheet extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final items = [
      _Item(Icons.login_outlined, 'Sign In/Out', '/sign-in-out'),
      _Item(Icons.event_available_outlined, 'Attendance', '/corporate-attendance'),
      _Item(Icons.calendar_month_outlined, 'Shifts', '/shifts'),
      _Item(Icons.attach_money_outlined, 'Expenses', '/expenses'),
      _Item(Icons.trending_up_outlined, 'Performance', '/performance'),
      _Item(Icons.business_outlined, 'Branches', '/admin/branches'),
      _Item(Icons.history_outlined, 'Audit Logs', '/admin/audit-logs'),
      _Item(Icons.message_outlined, 'Messages', '/messages'),
      _Item(Icons.video_call_outlined, 'Meetings', '/meetings'),
      _Item(Icons.campaign_outlined, 'Announcements', '/announcements'),
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
            Container(width: 48, height: 48, decoration: BoxDecoration(color: const Color(0xFF059669).withOpacity(0.1), borderRadius: BorderRadius.circular(12)), child: Icon(item.icon, color: const Color(0xFF059669), size: 22)),
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
