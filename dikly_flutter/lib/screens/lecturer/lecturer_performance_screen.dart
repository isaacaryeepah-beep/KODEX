import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _lecturerPerfProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getLecturerPerformance(),
);

class LecturerPerformanceScreen extends ConsumerWidget {
  const LecturerPerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_lecturerPerfProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('My Performance'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: async.when(
        loading: () => const Center(
          child: Text('Loading performance data...', style: TextStyle(fontSize: 14, color: DiklyColors.textSecondary)),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load performance data'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_lecturerPerfProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_lecturerPerfProvider),
          child: _LecturerPerfBody(data: data),
        ),
      ),
    );
  }
}

class _LecturerPerfBody extends StatelessWidget {
  final Map<String, dynamic> data;

  const _LecturerPerfBody({required this.data});

  int get _totalSessions =>
      (data['totalSessions'] as num?)?.toInt() ?? 0;

  double get _avgAttendance =>
      (data['avgAttendance'] as num?)?.toDouble() ?? 0.0;

  int get _coursesActive =>
      (data['coursesActive'] as num?)?.toInt() ?? 0;

  double get _feedbackScore =>
      (data['studentsFeedbackScore'] as num?)?.toDouble() ?? 0.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final metrics = [
      _LecturerMetric(
        label: 'Total Sessions Delivered',
        rawValue: _totalSessions.toDouble(),
        maxValue: 100,
        displayValue: '$_totalSessions',
        icon: Icons.video_library_outlined,
        color: DiklyColors.primary,
      ),
      _LecturerMetric(
        label: 'Average Attendance',
        rawValue: _avgAttendance,
        maxValue: 100,
        displayValue: '${_avgAttendance.toStringAsFixed(1)}%',
        icon: Icons.people_outline_rounded,
        color: DiklyColors.success,
      ),
      _LecturerMetric(
        label: 'Active Courses',
        rawValue: _coursesActive.toDouble(),
        maxValue: 20,
        displayValue: '$_coursesActive',
        icon: Icons.book_outlined,
        color: DiklyColors.warning,
      ),
      _LecturerMetric(
        label: 'Student Feedback Score',
        rawValue: _feedbackScore,
        maxValue: 5,
        displayValue: '${_feedbackScore.toStringAsFixed(1)} / 5',
        icon: Icons.star_outline_rounded,
        color: const Color(0xFF7C3AED),
      ),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'Student Performance',
          subtitle: 'Overview of student results across all your quizzes',
        ),
        // 2x2 metric grid
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.4,
          children: metrics.map((m) => _MetricCard(metric: m)).toList(),
        ),
        const SizedBox(height: 24),
        Text(
          'Performance Gauges',
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: DiklyColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: DiklyColors.border),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            children: metrics.map((m) => _GaugeRow(metric: m)).toList(),
          ),
        ),
        const SizedBox(height: 24),
        // Feedback stars card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: DiklyColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Student Feedback',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  ...List.generate(5, (i) {
                    final filled = i < _feedbackScore.floor();
                    final halfFilled = !filled &&
                        i < _feedbackScore &&
                        _feedbackScore - _feedbackScore.floor() >= 0.5;
                    return Icon(
                      halfFilled
                          ? Icons.star_half_rounded
                          : (filled ? Icons.star_rounded : Icons.star_border_rounded),
                      color: DiklyColors.warning,
                      size: 28,
                    );
                  }),
                  const SizedBox(width: 12),
                  Text(
                    '${_feedbackScore.toStringAsFixed(1)} out of 5',
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

class _LecturerMetric {
  final String label;
  final double rawValue;
  final double maxValue;
  final String displayValue;
  final IconData icon;
  final Color color;

  const _LecturerMetric({
    required this.label,
    required this.rawValue,
    required this.maxValue,
    required this.displayValue,
    required this.icon,
    required this.color,
  });

  double get progress => maxValue > 0
      ? (rawValue / maxValue).clamp(0.0, 1.0)
      : 0.0;
}

class _MetricCard extends StatelessWidget {
  final _LecturerMetric metric;

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
                metric.displayValue,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: metric.color,
                ),
              ),
              Text(
                metric.label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
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

class _GaugeRow extends StatelessWidget {
  final _LecturerMetric metric;

  const _GaugeRow({required this.metric});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(metric.icon, size: 16, color: metric.color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  metric.label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.textPrimary,
                  ),
                ),
              ),
              Text(
                metric.displayValue,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: metric.color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: metric.progress,
              backgroundColor: DiklyColors.background,
              valueColor: AlwaysStoppedAnimation<Color>(metric.color),
              minHeight: 8,
            ),
          ),
        ],
      ),
    );
  }
}
