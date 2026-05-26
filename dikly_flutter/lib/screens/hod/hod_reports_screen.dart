import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _hodReportsProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getReports(),
);

class HodReportsScreen extends ConsumerWidget {
  const HodReportsScreen({super.key});

  static const _color = Color(0xFF7C2D12);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_hodReportsProvider);

    return asyncData.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            Text(
              'Failed to load reports',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            TextButton(
              onPressed: () => ref.invalidate(_hodReportsProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (reports) {
        final attendance = _extractSection(
          reports,
          ['attendance', 'attendanceSummary'],
        );
        final grades = _extractSection(
          reports,
          ['grades', 'gradeDistribution'],
        );
        final sessions = _extractSection(
          reports,
          ['sessions', 'sessionStatistics'],
        );

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_hodReportsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _SectionHeader(icon: Icons.how_to_reg_outlined, title: 'Attendance Summary', color: DiklyColors.success),
              const SizedBox(height: 8),
              _ReportSection(
                title: 'Attendance Summary',
                icon: Icons.how_to_reg_outlined,
                color: DiklyColors.success,
                data: attendance,
              ),
              const SizedBox(height: 8),
              _ReportSection(
                title: 'Grade Distribution',
                icon: Icons.grade_outlined,
                color: DiklyColors.primary,
                data: grades,
              ),
              const SizedBox(height: 8),
              _ReportSection(
                title: 'Session Statistics',
                icon: Icons.videocam_outlined,
                color: _color,
                data: sessions,
              ),
              const SizedBox(height: 8),
              _ReportSection(
                title: 'All Report Data',
                icon: Icons.bar_chart_outlined,
                color: DiklyColors.warning,
                data: reports,
              ),
            ],
          ),
        );
      },
    );
  }

  Map<String, dynamic> _extractSection(
    Map<String, dynamic> reports,
    List<String> keys,
  ) {
    for (final key in keys) {
      final val = reports[key];
      if (val is Map<String, dynamic>) return val;
    }
    final found = <String, dynamic>{};
    for (final key in keys) {
      for (final entry in reports.entries) {
        if (entry.key.toLowerCase().contains(key.toLowerCase()) &&
            entry.value != null) {
          if (entry.value is Map<String, dynamic>) {
            found.addAll(entry.value as Map<String, dynamic>);
          } else {
            found[entry.key] = entry.value;
          }
        }
      }
    }
    return found;
  }
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.color,
  });

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _ReportSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final Map<String, dynamic> data;

  const _ReportSection({
    required this.title,
    required this.icon,
    required this.color,
    required this.data,
  });

  String _formatKey(String key) {
    return key
        .replaceAllMapped(
          RegExp(r'([A-Z])'),
          (m) => ' ${m.group(0)}',
        )
        .replaceAll('_', ' ')
        .trim()
        .split(' ')
        .map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }

  String _formatValue(dynamic value) {
    if (value == null) return '—';
    if (value is double) {
      return value == value.truncateToDouble()
          ? value.toInt().toString()
          : value.toStringAsFixed(2);
    }
    if (value is Map || value is List) return value.toString();
    return value.toString();
  }

  @override
  Widget build(BuildContext context) {
    final pairs = data.entries
        .where((e) => e.value != null && e.value is! Map && e.value is! List)
        .toList();
    final nested = data.entries
        .where((e) => e.value is Map || e.value is List)
        .toList();

    return Card(
      margin: EdgeInsets.zero,
      child: ExpansionTile(
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
        subtitle: data.isEmpty
            ? const Text(
                'No data available',
                style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
              )
            : Text(
                '${pairs.length + nested.length} item${(pairs.length + nested.length) == 1 ? '' : 's'}',
                style: const TextStyle(
                  fontSize: 12,
                  color: DiklyColors.textSecondary,
                ),
              ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [
          if (data.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Row(children: [
                Icon(
                  Icons.info_outline,
                  size: 16,
                  color: DiklyColors.textSecondary,
                ),
                SizedBox(width: 8),
                Text(
                  'No data available for this section',
                  style: TextStyle(
                    fontSize: 13,
                    color: DiklyColors.textSecondary,
                  ),
                ),
              ]),
            )
          else ...[
            ...pairs.map(
              (e) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 2,
                      child: Text(
                        _formatKey(e.key),
                        style: const TextStyle(
                          fontSize: 12,
                          color: DiklyColors.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 3,
                      child: Text(
                        _formatValue(e.value),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textPrimary,
                        ),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (nested.isNotEmpty) ...[
              const Divider(),
              ...nested.map(
                (e) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _formatKey(e.key),
                        style: TextStyle(
                          fontSize: 12,
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _formatValue(e.value),
                        style: const TextStyle(
                          fontSize: 12,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
