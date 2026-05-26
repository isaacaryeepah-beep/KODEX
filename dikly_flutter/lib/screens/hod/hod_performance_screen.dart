import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _departmentPerformanceProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>(
      (ref) => apiService.getDepartmentPerformance(),
    );

class HodPerformanceScreen extends ConsumerWidget {
  const HodPerformanceScreen({super.key});

  static const _color = Color(0xFF7C2D12);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_departmentPerformanceProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Department Performance'),
        leading: const BackButton(),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: DiklyColors.error,
              ),
              const SizedBox(height: 12),
              Text(
                'Failed to load performance data',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              TextButton(
                onPressed: () => ref.invalidate(_departmentPerformanceProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) {
          final attendanceRate =
              (data['attendanceRate'] as num?)?.toDouble() ?? 0.0;
          final averageGrade =
              (data['averageGrade'] as num?)?.toDouble() ?? 0.0;
          final sessionsCompleted = data['sessionsCompleted'] ?? 0;
          final studentsAtRisk = data['studentsAtRisk'] ?? 0;

          final courseAttendance =
              data['courseAttendance'] as List<dynamic>? ?? [];

          return RefreshIndicator(
            onRefresh: () async =>
                ref.invalidate(_departmentPerformanceProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.4,
                  children: [
                    _MetricCard(
                      title: 'Attendance Rate',
                      value: '${attendanceRate.toStringAsFixed(1)}%',
                      icon: Icons.how_to_reg_outlined,
                      color: DiklyColors.success,
                    ),
                    _MetricCard(
                      title: 'Average Grade',
                      value: averageGrade.toStringAsFixed(1),
                      icon: Icons.grade_outlined,
                      color: DiklyColors.primary,
                    ),
                    _MetricCard(
                      title: 'Sessions Done',
                      value: sessionsCompleted.toString(),
                      icon: Icons.videocam_outlined,
                      color: _color,
                    ),
                    _MetricCard(
                      title: 'At Risk',
                      value: studentsAtRisk.toString(),
                      icon: Icons.warning_amber_outlined,
                      color: DiklyColors.warning,
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                const Text(
                  'Attendance by Course',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: DiklyColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: courseAttendance.isEmpty
                      ? const _EmptyChartState()
                      : _AttendanceBarChart(courseData: courseAttendance),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _MetricCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const Spacer(),
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
              fontWeight: FontWeight.w500,
              color: DiklyColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyChartState extends StatelessWidget {
  const _EmptyChartState();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 140,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.bar_chart_outlined,
              size: 40,
              color: DiklyColors.textSecondary,
            ),
            SizedBox(height: 8),
            Text(
              'No attendance data available',
              style: TextStyle(
                fontSize: 13,
                color: DiklyColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttendanceBarChart extends StatelessWidget {
  final List<dynamic> courseData;

  const _AttendanceBarChart({required this.courseData});

  @override
  Widget build(BuildContext context) {
    final bars = courseData.take(6).toList();

    return SizedBox(
      height: 200,
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: 100,
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipItem: (group, groupIndex, rod, rodIndex) {
                final label = bars.length > groupIndex
                    ? (bars[groupIndex]['code']?.toString() ??
                        bars[groupIndex]['course']?.toString() ??
                        '${groupIndex + 1}')
                    : '';
                return BarTooltipItem(
                  '$label\n${rod.toY.toStringAsFixed(0)}%',
                  const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                );
              },
            ),
          ),
          titlesData: FlTitlesData(
            show: true,
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (value, meta) {
                  final idx = value.toInt();
                  if (idx >= bars.length) return const SizedBox.shrink();
                  final label = bars[idx]['code']?.toString() ??
                      bars[idx]['course']?.toString() ??
                      '${idx + 1}';
                  return Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      label.length > 6
                          ? label.substring(0, 6)
                          : label,
                      style: const TextStyle(
                        fontSize: 10,
                        color: DiklyColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  );
                },
              ),
            ),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 32,
                getTitlesWidget: (value, meta) => Text(
                  '${value.toInt()}%',
                  style: const TextStyle(
                    fontSize: 10,
                    color: DiklyColors.textSecondary,
                  ),
                ),
                interval: 25,
              ),
            ),
            topTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            rightTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
          ),
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: 25,
            getDrawingHorizontalLine: (_) => const FlLine(
              color: DiklyColors.border,
              strokeWidth: 1,
            ),
          ),
          borderData: FlBorderData(show: false),
          barGroups: List.generate(bars.length, (i) {
            final attendance =
                (bars[i]['attendance'] as num?)?.toDouble() ??
                    (bars[i]['attendanceRate'] as num?)?.toDouble() ??
                    0.0;
            return BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: attendance.clamp(0.0, 100.0),
                  color: const Color(0xFF7C2D12),
                  width: 22,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(4),
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }
}
