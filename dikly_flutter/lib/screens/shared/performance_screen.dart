import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _studentPerformanceProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getPerformance(),
);

final _lecturerPerformanceProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getLecturerPerformance(),
);

class PerformanceScreen extends ConsumerWidget {
  const PerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final isLecturer = user?.role == 'lecturer';

    final title = (user?.role == 'admin' || user?.role == 'manager')
        ? 'Performance'
        : 'My Performance';

    if (isLecturer) {
      final async = ref.watch(_lecturerPerformanceProvider);
      return _buildScaffold(
        context: context,
        title: title,
        body: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(onRetry: () => ref.refresh(_lecturerPerformanceProvider)),
          data: (data) => RefreshIndicator(
            onRefresh: () async => ref.refresh(_lecturerPerformanceProvider),
            child: _PerformanceBody(data: data, isLecturer: true),
          ),
        ),
      );
    }

    final async = ref.watch(_studentPerformanceProvider);
    return _buildScaffold(
      context: context,
      title: title,
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(onRetry: () => ref.refresh(_studentPerformanceProvider)),
        data: (data) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_studentPerformanceProvider),
          child: _PerformanceBody(data: data, isLecturer: false),
        ),
      ),
    );
  }

  Widget _buildScaffold({
    required BuildContext context,
    required String title,
    required Widget body,
  }) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text(title),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: body,
    );
  }
}

class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
          const SizedBox(height: 12),
          const Text('Failed to load performance data'),
          const SizedBox(height: 8),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

class _PerformanceBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final bool isLecturer;

  const _PerformanceBody({required this.data, required this.isLecturer});

  List<_MetricItem> get _metrics {
    if (isLecturer) {
      return [
        _MetricItem(
          label: 'Total Sessions',
          value: '${(data['totalSessions'] as num?)?.toInt() ?? 0}',
          icon: Icons.video_library_outlined,
          color: DiklyColors.primary,
        ),
        _MetricItem(
          label: 'Avg Attendance',
          value: '${(data['avgAttendance'] as num?)?.toStringAsFixed(1) ?? '0'}%',
          icon: Icons.people_outline_rounded,
          color: DiklyColors.success,
        ),
        _MetricItem(
          label: 'Active Courses',
          value: '${(data['coursesActive'] as num?)?.toInt() ?? 0}',
          icon: Icons.book_outlined,
          color: DiklyColors.warning,
        ),
        _MetricItem(
          label: 'Feedback Score',
          value: '${(data['studentsFeedbackScore'] as num?)?.toStringAsFixed(1) ?? '0'}/5',
          icon: Icons.star_outline_rounded,
          color: const Color(0xFF7C3AED),
        ),
      ];
    }
    return [
      _MetricItem(
        label: 'Attendance %',
        value: '${(data['attendanceRate'] as num?)?.toStringAsFixed(1) ?? '0'}%',
        icon: Icons.check_circle_outline_rounded,
        color: DiklyColors.success,
      ),
      _MetricItem(
        label: 'Quiz Average',
        value: '${(data['quizAverage'] ?? data['averageGrade'] as num?)?.toStringAsFixed(1) ?? '0'}%',
        icon: Icons.quiz_outlined,
        color: DiklyColors.primary,
      ),
      _MetricItem(
        label: 'Assignment Completion',
        value: '${(data['assignmentsCompleted'] as num?)?.toInt() ?? 0}',
        icon: Icons.assignment_turned_in_outlined,
        color: DiklyColors.warning,
      ),
      _MetricItem(
        label: 'Sessions Attended',
        value: '${(data['sessionsAttended'] as num?)?.toInt() ?? 0}',
        icon: Icons.calendar_today_outlined,
        color: const Color(0xFF7C3AED),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'Performance',
          subtitle: isLecturer ? 'Your teaching metrics' : 'Your personal performance metrics',
        ),

        // Header: "Performance"
        // Line chart placeholder card — grey area, "Coming Soon"
        DiklyCard(
          margin: const EdgeInsets.only(bottom: 20),
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
                child: Text(
                  'Attendance Over Time',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
              ),
              Container(
                height: 160,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                decoration: BoxDecoration(
                  color: DiklyColors.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: DiklyColors.border),
                ),
                child: const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.show_chart_rounded, size: 40, color: DiklyColors.textMuted),
                      SizedBox(height: 8),
                      Text(
                        'Coming Soon',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textMuted,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Chart visualisation will be available here',
                        style: TextStyle(fontSize: 11, color: DiklyColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // Stats cards
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.4,
          children: _metrics.map((m) => _MetricCard(metric: m)).toList(),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

class _MetricItem {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _MetricItem({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });
}

class _MetricCard extends StatelessWidget {
  final _MetricItem metric;
  const _MetricCard({required this.metric});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: metric.color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(metric.icon, size: 20, color: metric.color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                metric.value,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: metric.color,
                ),
              ),
              Text(
                metric.label,
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
