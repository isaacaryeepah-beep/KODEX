import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodCourseOverviewProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getHodCourseOverview(),
);

class HodCoursesScreen extends ConsumerWidget {
  const HodCoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_hodCourseOverviewProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            const Text('Failed to load courses'),
            TextButton(
              onPressed: () => ref.refresh(_hodCourseOverviewProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (data) {
        final courses = (data['courses'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        final count = courses.length;

        return RefreshIndicator(
          onRefresh: () async => ref.refresh(_hodCourseOverviewProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: DiklyScreenHeader(
                      title: 'Course Oversight',
                      subtitle: '$count course${count == 1 ? '' : 's'} · last 30 days activity shown',
                    ),
                  ),
                  OutlinedButton(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Export CSV — coming soon')),
                    ),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      foregroundColor: const Color(0xFF374151),
                    ),
                    child: const Text('Export CSV', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
              // Table
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: DiklyColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header row
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: const BoxDecoration(
                        color: Color(0xFFF9FAFB),
                        borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
                        border: Border(bottom: BorderSide(color: DiklyColors.border)),
                      ),
                      child: const Row(
                        children: [
                          Expanded(flex: 3, child: _HeaderCell('NAME')),
                          Expanded(flex: 2, child: _HeaderCell('LECTURER')),
                          Expanded(flex: 1, child: _HeaderCell('SESSIONS')),
                          Expanded(flex: 1, child: _HeaderCell('ATTENDANCE')),
                        ],
                      ),
                    ),
                    if (courses.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(
                          child: Text(
                            'No courses found for this department.',
                            style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                          ),
                        ),
                      )
                    else
                      ...courses.asMap().entries.map((e) {
                        final i = e.key;
                        final c = e.value;
                        final title = c['title']?.toString() ?? '—';
                        final code = c['code']?.toString() ?? '';
                        final lecturer = (c['lecturer'] as Map?)?['name']?.toString() ??
                            c['lecturerName']?.toString() ?? '—';
                        final sessions = c['sessions30'] ?? c['sessionCount'] ?? 0;
                        final attendance = c['totalAttendance'] ?? c['attendance'] ?? 0;

                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(
                            color: i.isOdd ? const Color(0xFFFAFAFA) : Colors.white,
                            border: i < courses.length - 1
                                ? const Border(bottom: BorderSide(color: DiklyColors.border))
                                : null,
                            borderRadius: i == courses.length - 1
                                ? const BorderRadius.vertical(bottom: Radius.circular(10))
                                : null,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                flex: 3,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title,
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    if (code.isNotEmpty)
                                      Text(
                                        code,
                                        style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)),
                                      ),
                                  ],
                                ),
                              ),
                              Expanded(
                                flex: 2,
                                child: Text(
                                  lecturer,
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF374151)),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Expanded(
                                flex: 1,
                                child: Text(
                                  '$sessions',
                                  style: const TextStyle(fontSize: 12, color: Color(0xFF374151), fontWeight: FontWeight.w500),
                                ),
                              ),
                              Expanded(
                                flex: 1,
                                child: Text(
                                  '$attendance',
                                  style: const TextStyle(fontSize: 12, color: Color(0xFF374151), fontWeight: FontWeight.w500),
                                ),
                              ),
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
    );
  }
}

class _HeaderCell extends StatelessWidget {
  final String label;
  const _HeaderCell(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: Color(0xFF9CA3AF),
        letterSpacing: 0.4,
      ),
    );
  }
}
