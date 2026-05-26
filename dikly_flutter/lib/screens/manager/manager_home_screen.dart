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

    final firstName = (user?.name ?? 'Manager').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Plain welcome section
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back, $firstName',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      "Here's an overview of your workspace at $institution",
                      style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ),
                  if (deptBadge.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        deptBadge,
                        style: const TextStyle(
                          color: Color(0xFFD97706),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
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

