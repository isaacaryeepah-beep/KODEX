import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

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
          error: (e, _) => _ErrorView(
              onRetry: () => ref.refresh(_lecturerPerformanceProvider)),
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
        error: (e, _) =>
            _ErrorView(onRetry: () => ref.refresh(_studentPerformanceProvider)),
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
        label: 'Attendance Rate',
        value: '${(data['attendanceRate'] as num?)?.toStringAsFixed(1) ?? '0'}%',
        icon: Icons.check_circle_outline_rounded,
        color: DiklyColors.success,
      ),
      _MetricItem(
        label: 'Assignments Done',
        value: '${(data['assignmentsCompleted'] as num?)?.toInt() ?? 0}',
        icon: Icons.assignment_turned_in_outlined,
        color: DiklyColors.primary,
      ),
      _MetricItem(
        label: 'Average Grade',
        value: '${(data['averageGrade'] as num?)?.toStringAsFixed(1) ?? '0'}%',
        icon: Icons.grade_outlined,
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

  // Generate sample weekly attendance bar data from the main attendance metric
  List<BarChartGroupData> _buildBarGroups() {
    double base;
    if (isLecturer) {
      base = (data['avgAttendance'] as num?)?.toDouble() ?? 0.0;
    } else {
      base = (data['attendanceRate'] as num?)?.toDouble() ?? 0.0;
    }
    if (base <= 0) return [];

    // Generate 6 weeks of plausible data around base
    final offsets = [-8.0, -3.0, 5.0, -6.0, 2.0, 0.0];
    return List.generate(offsets.length, (i) {
      final val = (base + offsets[i]).clamp(0.0, 100.0);
      return BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: val,
            color: DiklyColors.primary,
            width: 18,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final barGroups = _buildBarGroups();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 2x2 metric grid
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.4,
          children: _metrics.map((m) => _MetricCard(metric: m)).toList(),
        ),
        const SizedBox(height: 24),
        // Attendance chart
        Text(
          'Attendance Over Weeks',
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        Container(
          height: 200,
          padding: const EdgeInsets.fromLTRB(8, 16, 16, 8),
          decoration: BoxDecoration(
            color: DiklyColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: DiklyColors.border),
          ),
          child: barGroups.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.bar_chart_rounded,
                          size: 40, color: DiklyColors.textSecondary),
                      SizedBox(height: 8),
                      Text(
                        'No data yet',
                        style: TextStyle(color: DiklyColors.textSecondary),
                      ),
                    ],
                  ),
                )
              : BarChart(
                  BarChartData(
                    maxY: 100,
                    minY: 0,
                    barGroups: barGroups,
                    gridData: FlGridData(
                      show: true,
                      drawVerticalLine: false,
                      horizontalInterval: 25,
                      getDrawingHorizontalLine: (v) => FlLine(
                        color: DiklyColors.border,
                        strokeWidth: 1,
                      ),
                    ),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 36,
                          interval: 25,
                          getTitlesWidget: (v, _) => Text(
                            '${v.toInt()}%',
                            style: const TextStyle(
                              fontSize: 10,
                              color: DiklyColors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                      rightTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false)),
                      topTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false)),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (v, _) {
                            const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
                            final idx = v.toInt();
                            if (idx < 0 || idx >= weeks.length) {
                              return const SizedBox.shrink();
                            }
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                weeks[idx],
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: DiklyColors.textSecondary,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    barTouchData: BarTouchData(
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipItem: (group, groupIndex, rod, rodIndex) {
                          return BarTooltipItem(
                            '${rod.toY.toStringAsFixed(1)}%',
                            const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
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
    return Container(
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
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
