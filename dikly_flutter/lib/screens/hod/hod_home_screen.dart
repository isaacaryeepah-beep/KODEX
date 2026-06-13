import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getHodOverview(),
);

final _hodApprovalsProvider = FutureProvider.autoDispose<int>((ref) async {
  final list = await apiService.getPendingApprovals();
  return list.length;
});

class HodHomeScreen extends ConsumerWidget {
  const HodHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashAsync = ref.watch(_hodDashProvider);
    final approvalsAsync = ref.watch(_hodApprovalsProvider);
    final user = ref.watch(authProvider).user;
    final department = user?.department ?? '';
    final institution = user?.company ?? '';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_hodDashProvider);
        ref.invalidate(_hodApprovalsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Department Overview',
                      style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
                    ),
                    const SizedBox(height: 4),
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textLight),
                        children: [
                          TextSpan(text: 'Welcome back, ${(user?.name ?? 'HOD').split(' ').first} · '),
                          TextSpan(
                            text: department.isNotEmpty ? department : 'No Department Assigned',
                            style: TextStyle(
                              color: department.isNotEmpty ? const Color(0xFF0891B2) : DiklyColors.warning,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (institution.isNotEmpty) TextSpan(text: ' — $institution'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          if (department.isEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Color(0xFFD97706), size: 18),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'No department assigned. Ask your admin to update your profile.',
                      style: TextStyle(fontSize: 12, color: Color(0xFFB45309)),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),

          dashAsync.when(
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: DiklyColors.primary))),
            error: (e, _) => DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 36, color: DiklyColors.error),
                  const SizedBox(height: 10),
                  const Text('Failed to load overview'),
                  const SizedBox(height: 10),
                  TextButton(onPressed: () => ref.invalidate(_hodDashProvider), child: const Text('Retry')),
                ],
              ),
            ),
            data: (overview) {
              final lecturers = overview['totalLecturers'] ?? 0;
              final students = overview['totalStudents'] ?? 0;
              final sessions = overview['totalSessions'] ?? 0;
              final liveNow = overview['activeSessions'] ?? 0;
              final recentSessions = (overview['recentSessions'] as List?) ?? [];

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Stats: Lecturers, Students, Sessions, Live Now — 4-in-a-row
                  Row(
                    children: [
                      _HodStatCard(
                        value: lecturers.toString(),
                        label: 'LECTURERS',
                        color: const Color(0xFF3B82F6),
                        onTap: () => context.push('/hod/lecturers'),
                      ),
                      const SizedBox(width: 8),
                      _HodStatCard(
                        value: students.toString(),
                        label: 'STUDENTS',
                        color: const Color(0xFF10B981),
                        onTap: () => context.push('/hod/students'),
                      ),
                      const SizedBox(width: 8),
                      _HodStatCard(
                        value: sessions.toString(),
                        label: 'SESSIONS (RECENT)',
                        color: const Color(0xFFF59E0B),
                        onTap: () => context.push('/hod/sessions'),
                      ),
                      const SizedBox(width: 8),
                      _HodStatCard(
                        value: liveNow.toString(),
                        label: 'LIVE NOW',
                        color: liveNow > 0 ? DiklyColors.success : DiklyColors.textLight,
                        onTap: () => context.push('/hod/sessions'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Quick Actions + header buttons
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => context.push('/announcements'),
                          icon: const Icon(Icons.notifications_outlined, size: 15),
                          label: const Text('Announcements'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF0891B2),
                            side: const BorderSide(color: Color(0xFF0891B2)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => context.push('/subscription'),
                          icon: const Icon(Icons.star_outlined, size: 15),
                          label: const Text('Subscription'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: DiklyColors.primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            elevation: 0,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Recent Sessions
                  DiklyCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Expanded(child: Text('Recent Sessions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text))),
                            GestureDetector(
                              onTap: () => context.push('/hod/sessions'),
                              child: const Text('View All →', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        if (recentSessions.isEmpty)
                          const Text('No sessions yet.', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))
                        else
                          ...recentSessions.take(5).map<Widget>((s) {
                            final sm = s as Map;
                            final status = sm['status']?.toString() ?? '';
                            final isLive = ['active', 'live'].contains(status);
                            final statusColor = isLive ? DiklyColors.success : status == 'stopped' ? DiklyColors.error : DiklyColors.textLight;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                children: [
                                  Container(width: 8, height: 8, margin: const EdgeInsets.only(right: 10, top: 3), decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(sm['title']?.toString() ?? 'Untitled', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis),
                                        Text((sm['createdBy'] as Map?)?['name']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                                      ],
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                    decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                                    child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
                                  ),
                                ],
                              ),
                            );
                          }),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Quick Actions card
                  DiklyCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Quick Actions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                        const SizedBox(height: 10),
                        _hodAction(context, Icons.cast_for_education_outlined, 'View Lecturers', () => context.push('/hod/lecturers')),
                        _hodAction(context, Icons.people_outlined, 'View Students', () => context.push('/hod/students')),
                        _hodAction(context, Icons.description_outlined, 'Department Reports', () => context.push('/hod/reports')),
                        _hodAction(context, Icons.bar_chart_rounded, 'Performance Dashboard', () => context.push('/hod/performance')),
                        _hodAction(context, Icons.warning_amber_outlined, 'Smart Alerts', () => context.push('/hod/alerts')),
                        _hodAction(context, Icons.message_outlined, 'Dept. Messaging', () => context.push('/messages')),
                        _hodAction(context, Icons.notifications_outlined, 'Post Announcement', () => context.push('/announcements')),
                        approvalsAsync.when(
                          loading: () => _hodAction(context, Icons.pending_actions_outlined, 'Pending Approvals', () => context.push('/hod/approvals')),
                          error: (_, __) => _hodAction(context, Icons.pending_actions_outlined, 'Pending Approvals', () => context.push('/hod/approvals')),
                          data: (count) => _hodAction(
                            context, Icons.pending_actions_outlined,
                            'Pending Approvals',
                            () => context.push('/hod/approvals'),
                            badge: count > 0 ? count : null,
                          ),
                        ),
                        _hodAction(context, Icons.check_circle_outline, 'Course Approvals', () => context.push('/hod/course-approvals')),
                        _hodAction(context, Icons.lock_open_outlined, 'Locked Students', () => context.push('/hod/locked-students')),
                        const Divider(height: 20),
                        const Text('Export', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textLight, letterSpacing: 0.4)),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          children: [
                            _exportChip('Students CSV'),
                            _exportChip('Lecturers CSV'),
                            _exportChip('Attendance CSV'),
                          ],
                        ),
                      ],
                    ),
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

  Widget _hodAction(BuildContext context, IconData icon, String label, VoidCallback onTap, {int? badge}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: DiklyColors.grey100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 16, color: DiklyColors.textSecondary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: DiklyColors.text)),
            ),
            if (badge != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: DiklyColors.error, borderRadius: BorderRadius.circular(20)),
                child: Text('$badge', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
              ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right, size: 16, color: DiklyColors.textLight),
          ],
        ),
      ),
    );
  }

  Widget _exportChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: DiklyColors.grey100,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
    );
  }
}

class _HodStatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  const _HodStatCard({required this.value, required this.label, required this.color, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 8),
              Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
              Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 8, color: Color(0xFF9CA3AF), letterSpacing: 0.2, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
