import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodPerfProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getHodDeptStats(),
);

class HodPerformanceScreen extends ConsumerWidget {
  const HodPerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_hodPerfProvider);
    final user = ref.watch(currentUserProvider);
    final dept = user?.department ?? user?.company ?? 'Department';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Performance'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load performance data'),
              TextButton(
                onPressed: () => ref.refresh(_hodPerfProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) {
          final totalSessions = data['totalSessions'] ?? 0;
          final totalAttendance = data['totalAttendance'] ?? 0;
          final avgAttendance = (data['avgAttendance'] as num?)?.toDouble() ?? 0.0;
          final bestCourse = data['bestCourse']?.toString() ?? '';
          final lecturerSummary = (data['lecturerSummary'] as List?) ?? [];
          final hasData = totalSessions > 0;

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(_hodPerfProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: DiklyScreenHeader(
                        title: 'Performance Dashboard',
                        subtitle: '$dept · last 30 days',
                      ),
                    ),
                    OutlinedButton(
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Export — coming soon')),
                      ),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        side: const BorderSide(color: Color(0xFFD1D5DB)),
                        foregroundColor: const Color(0xFF374151),
                      ),
                      child: const Text('Export Attendance CSV', style: TextStyle(fontSize: 11)),
                    ),
                  ],
                ),
                // 4 stat cards in a row
                Row(
                  children: [
                    _StatCard(value: '$totalSessions', label: 'TOTAL SESSIONS', color: DiklyColors.primary),
                    const SizedBox(width: 8),
                    _StatCard(value: '$totalAttendance', label: 'TOTAL ATTENDANCE', color: DiklyColors.success),
                    const SizedBox(width: 8),
                    _StatCard(value: avgAttendance.toStringAsFixed(1), label: 'AVG / SESSION', color: DiklyColors.warning),
                    const SizedBox(width: 8),
                    _StatCard(value: bestCourse.isEmpty ? '—' : bestCourse, label: 'BEST COURSE', color: const Color(0xFF7C3AED)),
                  ],
                ),
                const SizedBox(height: 16),
                // Lecturer Activity Summary
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.fromLTRB(16, 14, 16, 10),
                        child: Text(
                          'Lecturer Activity Summary',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                        ),
                      ),
                      const Divider(height: 1, color: DiklyColors.border),
                      if (!hasData || lecturerSummary.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                          child: Text(
                            'No session data in the last 30 days.',
                            style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                          ),
                        )
                      else
                        ...lecturerSummary.map((l) {
                          final m = l as Map;
                          final name = m['name']?.toString() ?? '—';
                          final sessions = m['sessions'] ?? m['sessionCount'] ?? 0;
                          final attendance = m['attendance'] ?? m['totalAttendance'] ?? 0;
                          return Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: const BoxDecoration(
                              border: Border(top: BorderSide(color: DiklyColors.border)),
                            ),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  radius: 18,
                                  backgroundColor: const Color(0xFF7C2D12).withOpacity(0.1),
                                  child: Text(
                                    name.isNotEmpty ? name[0].toUpperCase() : 'L',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF7C2D12)),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
                                ),
                                Text('$sessions sessions', style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                                const SizedBox(width: 12),
                                Text('$attendance attend.', style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
          boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 1))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color, height: 1)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 7, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.2)),
          ],
        ),
      ),
    );
  }
}
