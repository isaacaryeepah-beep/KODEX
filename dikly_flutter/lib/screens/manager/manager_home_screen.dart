import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

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
    final presentToday = _employees.where((e) => e['clockedIn'] == true).length;

    final firstName = (user?.name ?? 'Manager').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Welcome header
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
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
                      const SizedBox(height: 4),
                      Text(
                        "Here's an overview of your workspace at $institution",
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                    ],
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
            const SizedBox(height: 20),

            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
            else ...[
              // 2×2 Stats grid
              const Text(
                'Overview',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.5,
                children: [
                  _StatCard(
                    title: 'Team Size',
                    value: _employees.length.toString(),
                    icon: Icons.people_outlined,
                    color: const Color(0xFF0891B2),
                  ),
                  _StatCard(
                    title: 'Pending Leaves',
                    value: pendingLeave.toString(),
                    icon: Icons.event_note_outlined,
                    color: DiklyColors.warning,
                  ),
                  _StatCard(
                    title: "Today's Present",
                    value: presentToday.toString(),
                    icon: Icons.check_circle_outline,
                    color: DiklyColors.success,
                  ),
                  _StatCard(
                    title: 'Reports',
                    value: '—',
                    icon: Icons.assessment_outlined,
                    color: DiklyColors.primary,
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Quick actions
              const Text(
                'Quick Actions',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.people_outlined,
                      label: 'View Team',
                      color: const Color(0xFF0891B2),
                      onTap: () => context.push('/manager/team'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.event_note_outlined,
                      label: 'Leave Requests',
                      color: DiklyColors.warning,
                      onTap: () => context.push('/manager/leave-requests'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _QuickAction(
                      icon: Icons.receipt_long_outlined,
                      label: 'Timesheets',
                      color: DiklyColors.primary,
                      onTap: () => context.push('/manager/timesheets'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  color: DiklyColors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: color),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: DiklyColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
