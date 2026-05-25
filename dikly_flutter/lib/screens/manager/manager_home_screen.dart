import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

class ManagerHomeScreen extends ConsumerStatefulWidget {
  const ManagerHomeScreen({super.key});

  @override
  ConsumerState<ManagerHomeScreen> createState() => _ManagerHomeScreenState();
}

class _ManagerHomeScreenState extends ConsumerState<ManagerHomeScreen> {
  List<dynamic> _employees = [];
  List<dynamic> _leaveRequests = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final users = await apiService.getUsers();
      final leaves = await apiService.getLeaveRequests();
      setState(() { _employees = users; _leaveRequests = leaves; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final pendingLeave = _leaveRequests.where((l) => l['status'] == 'pending').length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _WelcomeCard(name: user?.name ?? 'Manager'),
          const SizedBox(height: 20),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else ...[
            const Text('Overview', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: StatCard(title: 'Employees', value: _employees.length.toString(), icon: Icons.people_outlined, color: const Color(0xFF059669))),
              const SizedBox(width: 12),
              Expanded(child: StatCard(title: 'Pending Leave', value: pendingLeave.toString(), icon: Icons.event_note_outlined, color: DiklyColors.warning)),
            ]),
          ],
        ],
      ),
    );
  }
}

class _WelcomeCard extends StatelessWidget {
  final String name;
  const _WelcomeCard({required this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF059669), Color(0xFF047857)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: const Color(0xFF059669).withOpacity(0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Manager Portal', style: TextStyle(color: Colors.white70, fontSize: 12, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text(name.split(' ').first, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
        ])),
        const Icon(Icons.business_center, color: Colors.white60, size: 40),
      ]),
    );
  }
}
