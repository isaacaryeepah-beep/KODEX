import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodDeptStatsProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) async {
    final results = await Future.wait([
      apiService.getHodDeptStats(),
      apiService.getHodCourseOverview(),
      apiService.getDepartmentLecturers(),
    ]);
    return {
      'stats': results[0],
      'courseOverview': results[1],
      'lecturers': results[2],
    };
  },
);

class HodReportsScreen extends ConsumerWidget {
  const HodReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_hodDeptStatsProvider);

    return asyncData.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            Text('Failed to load reports', style: Theme.of(context).textTheme.titleMedium),
            TextButton(onPressed: () => ref.invalidate(_hodDeptStatsProvider), child: const Text('Retry')),
          ],
        ),
      ),
      data: (data) {
        final stats = (data['stats'] as Map<String, dynamic>?) ?? {};
        final courseOverviewData = (data['courseOverview'] as Map<String, dynamic>?) ?? {};
        final lecturers = (data['lecturers'] as List?) ?? [];
        final courses = (courseOverviewData['courses'] as List?)?.cast<Map<String, dynamic>>() ?? [];

        final totalSessions = stats['totalSessions'] ?? 0;
        final totalAttendance = stats['totalAttendance'] ?? 0;
        final avgAttendance = stats['avgAttendance'] ?? 0;
        final lecturerSummary = (stats['lecturerSummary'] as List?)?.cast<Map<String, dynamic>>() ?? [];

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_hodDeptStatsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Department Reports',
                subtitle: 'Attendance and activity overview',
              ),

              // 4 stat cards in a row
              Row(
                children: [
                  _StatCard(value: '$totalSessions', label: 'TOTAL SESSIONS', color: const Color(0xFF2563EB)),
                  const SizedBox(width: 8),
                  _StatCard(value: '$totalAttendance', label: 'TOTAL ATTENDANCE', color: const Color(0xFF10B981)),
                  const SizedBox(width: 8),
                  _StatCard(value: '$avgAttendance', label: 'AVG ATTENDANCE', color: const Color(0xFFF59E0B)),
                  const SizedBox(width: 8),
                  _StatCard(value: '${lecturers.length}', label: 'LECTURERS', color: const Color(0xFF7C3AED)),
                ],
              ),
              const SizedBox(height: 20),

              // Attendance Rate by Course
              DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance Rate by Course',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const SizedBox(height: 12),
                    if (courses.isEmpty)
                      const Text('No data yet.', style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)))
                    else
                      ...courses.take(5).map((c) {
                        final title = c['title']?.toString() ?? 'Untitled';
                        final totalAtt = c['totalAttendance'] ?? 0;
                        final sessions30 = c['sessions30'] ?? 0;
                        final enrolled = c['enrolled'] ?? 1;
                        final rate = sessions30 > 0 && enrolled > 0
                          ? ((totalAtt / (sessions30 * enrolled)) * 100).clamp(0, 100).round()
                          : 0;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151)), overflow: TextOverflow.ellipsis)),
                                  Text('$rate%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(3),
                                child: LinearProgressIndicator(
                                  value: rate / 100,
                                  backgroundColor: const Color(0xFFE5E7EB),
                                  valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                                  minHeight: 6,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Attendance by Lecturer
              DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance by Lecturer',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const SizedBox(height: 12),
                    if (lecturerSummary.isEmpty)
                      const Text('No data yet.', style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)))
                    else
                      ...lecturerSummary.take(5).map((l) {
                        final name = l['name']?.toString() ?? 'Unknown';
                        final sessions = l['sessions'] ?? 0;
                        final attendance = l['attendance'] ?? 0;
                        final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 16,
                                backgroundColor: const Color(0xFF7C3AED).withOpacity(0.1),
                                child: Text(initials, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF7C3AED))),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
                                    Text('$sessions sessions · $attendance attendance', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Attendance Trend (Last 30 Days)
              DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance Trend (Last 30 Days)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const SizedBox(height: 8),
                    if (totalSessions == 0)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No data yet.', style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF))),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            _TrendStat(label: 'Sessions', value: '$totalSessions', color: const Color(0xFF2563EB)),
                            const SizedBox(width: 16),
                            _TrendStat(label: 'Total Attendees', value: '$totalAttendance', color: const Color(0xFF10B981)),
                            const SizedBox(width: 16),
                            _TrendStat(label: 'Avg per Session', value: '$avgAttendance', color: const Color(0xFFF59E0B)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
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
      child: DiklyCard(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: color, height: 1)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.3)),
          ],
        ),
      ),
    );
  }
}

class _TrendStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _TrendStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
      ],
    );
  }
}
