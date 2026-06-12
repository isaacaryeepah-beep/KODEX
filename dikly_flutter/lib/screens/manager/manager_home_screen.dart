import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _managerDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getManagerDashboardData(),
);

class ManagerHomeScreen extends ConsumerWidget {
  const ManagerHomeScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashAsync = ref.watch(_managerDashProvider);
    final user = ref.watch(authProvider).user;
    final firstName = (user?.name ?? 'Manager').split(' ').first;
    final institution = user?.company ?? '';

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_managerDashProvider),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Welcome row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()}, $firstName',
                      style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${institution.isNotEmpty ? '$institution · ' : ''}Manager Portal',
                      style: const TextStyle(fontSize: 13, color: DiklyColors.textLight),
                    ),
                  ],
                ),
              ),
              dashAsync.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (data) {
                  final pending = (data['pendingApprovals'] as List).length;
                  return Row(
                    children: [
                      OutlinedButton(
                        onPressed: () => context.push('/corporate-attendance'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.primary,
                          side: const BorderSide(color: DiklyColors.primary),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        ),
                        child: const Text('Team Attendance', style: TextStyle(fontSize: 12)),
                      ),
                      const SizedBox(width: 8),
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          OutlinedButton(
                            onPressed: () => context.push('/sessions'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: DiklyColors.textSecondary,
                              side: const BorderSide(color: DiklyColors.border),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            ),
                            child: const Text('Approvals', style: TextStyle(fontSize: 12)),
                          ),
                          if (pending > 0)
                            Positioned(
                              right: -4,
                              top: -4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                decoration: BoxDecoration(color: DiklyColors.error, borderRadius: BorderRadius.circular(20)),
                                child: Text('$pending', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                              ),
                            ),
                        ],
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 20),

          dashAsync.when(
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: DiklyColors.primary))),
            error: (e, _) => DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_off_rounded, size: 36, color: DiklyColors.textLight),
                  const SizedBox(height: 10),
                  const Text('Failed to load manager data', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: () => ref.invalidate(_managerDashProvider),
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Retry'),
                    style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                  ),
                ],
              ),
            ),
            data: (data) {
              final summary = data['todaySummary'] as Map<String, dynamic>;
              final todayRecords = data['todayRecords'] as List;
              final teamOverview = data['teamOverview'] as List;
              final pendingList = data['pendingApprovals'] as List;
              final announcements = data['announcements'] as List;

              final late = todayRecords.where((r) => r['status'] == 'late').toList();
              final absent = todayRecords.where((r) => r['status'] == 'absent').toList();

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Today's attendance section label
                  const DiklySectionLabel(label: "Today's Attendance"),
                  const SizedBox(height: 10),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _TodayStat(value: '${summary['present'] ?? 0}', label: 'Present', color: const Color(0xFF16A34A)),
                        const SizedBox(width: 10),
                        _TodayStat(value: '${summary['late'] ?? 0}', label: 'Late', color: const Color(0xFFD97706)),
                        const SizedBox(width: 10),
                        _TodayStat(value: '${summary['absent'] ?? 0}', label: 'Absent', color: const Color(0xFFDC2626)),
                        const SizedBox(width: 10),
                        _TodayStat(value: '${summary['on_leave'] ?? 0}', label: 'On Leave', color: const Color(0xFF0891B2)),
                        const SizedBox(width: 10),
                        _TodayStat(value: '${summary['total_clocked'] ?? 0}', label: 'Clocked In', color: DiklyColors.primary),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Exception alerts + Team performance
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: DiklyCard(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Expanded(child: Text('Exception Alerts', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text))),
                                  const Text('Today', style: TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                                ],
                              ),
                              const SizedBox(height: 12),
                              if (late.isEmpty && absent.isEmpty)
                                const Text('✓ No exceptions today', style: TextStyle(fontSize: 13, color: Color(0xFF16A34A), fontWeight: FontWeight.w600))
                              else ...[
                                if (late.isNotEmpty) ...[
                                  Text('Late Arrivals (${late.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFD97706))),
                                  const SizedBox(height: 6),
                                  ...late.take(3).map((r) => Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(child: Text(r['employee']?['name'] ?? '—', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), overflow: TextOverflow.ellipsis)),
                                        Text('+${r['lateMinutes'] ?? 0}m', style: const TextStyle(fontSize: 11, color: Color(0xFFD97706))),
                                      ],
                                    ),
                                  )),
                                ],
                                if (absent.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Text('Absent (${absent.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
                                  const SizedBox(height: 4),
                                  ...absent.take(3).map((r) => Padding(
                                    padding: const EdgeInsets.only(bottom: 4),
                                    child: Text(r['employee']?['name'] ?? '—', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), overflow: TextOverflow.ellipsis),
                                  )),
                                ],
                              ],
                              const SizedBox(height: 10),
                              GestureDetector(
                                onTap: () => context.push('/corporate-attendance'),
                                child: const Text('View Full Report →', style: TextStyle(fontSize: 12, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DiklyCard(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Expanded(child: Text('Team Performance', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text))),
                                  GestureDetector(
                                    onTap: () => context.push('/performance'),
                                    child: const Text('Full View', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              if (teamOverview.isEmpty)
                                const Text('No performance data yet.', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))
                              else ...[
                                ...teamOverview.take(4).map((o) => Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text(o['employee']?['name'] ?? '—', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), overflow: TextOverflow.ellipsis)),
                                      Text('${o['completedGoals'] ?? 0}/${o['totalGoals'] ?? 0}', style: const TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                                    ],
                                  ),
                                )),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Pending approvals + Announcements
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: DiklyCard(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Expanded(child: Text('Pending Approvals', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(20)),
                                    child: Text('${pendingList.length}', style: const TextStyle(color: Color(0xFFDC2626), fontSize: 11, fontWeight: FontWeight.w700)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              if (pendingList.isEmpty)
                                const Text('No pending approvals', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))
                              else
                                ...pendingList.take(4).map((p) => Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Row(
                                    children: [
                                      Expanded(child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(p['requestedBy']?['name'] ?? p['name'] ?? '—', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                                          Text(p['type'] ?? 'Request', style: const TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                                        ],
                                      )),
                                      GestureDetector(
                                        onTap: () => context.push('/manager/leave-requests'),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                                          child: const Text('Review', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
                                        ),
                                      ),
                                    ],
                                  ),
                                )),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DiklyCard(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Expanded(child: Text('Announcements', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
                                  GestureDetector(
                                    onTap: () => context.push('/announcements'),
                                    child: const Text('Manage', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              if (announcements.isEmpty)
                                const Text('No announcements', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))
                              else
                                ...announcements.take(4).map((a) {
                                  final dotColor = _annColor(a['type']?.toString());
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          width: 7,
                                          height: 7,
                                          margin: const EdgeInsets.only(right: 8, top: 4),
                                          decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
                                        ),
                                        Expanded(child: Text(a['title'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis)),
                                      ],
                                    ),
                                  );
                                }),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Quick actions
                  const DiklySectionLabel('Quick Actions'),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(child: _ManagerAction(icon: Icons.people_outlined, label: 'View Team', color: const Color(0xFF0891B2), onTap: () => context.push('/manager/team'))),
                      const SizedBox(width: 10),
                      Expanded(child: _ManagerAction(icon: Icons.event_note_outlined, label: 'Leave Requests', color: DiklyColors.warning, onTap: () => context.push('/manager/leave-requests'))),
                      const SizedBox(width: 10),
                      Expanded(child: _ManagerAction(icon: Icons.receipt_long_outlined, label: 'Timesheets', color: DiklyColors.primary, onTap: () => context.push('/manager/timesheets'))),
                    ],
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Color _annColor(String? type) {
    switch (type) {
      case 'info': return const Color(0xFF3B82F6);
      case 'warning': return const Color(0xFFF59E0B);
      case 'success': return DiklyColors.success;
      case 'urgent': return DiklyColors.error;
      default: return DiklyColors.textLight;
    }
  }
}

class _TodayStat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _TodayStat({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 90,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border(top: BorderSide(color: color, width: 3)),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color, height: 1)),
          const SizedBox(height: 3),
          Text(label, style: const TextStyle(fontSize: 10, color: DiklyColors.textLight, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _ManagerAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ManagerAction({required this.icon, required this.label, required this.color, required this.onTap});

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
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 20, color: color),
          ),
          const SizedBox(height: 8),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
        ],
      ),
    );
  }
}
