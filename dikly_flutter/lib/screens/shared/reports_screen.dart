import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  Map<String, dynamic>? _reports;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await apiService.getReports();
      setState(() { _reports = data; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Reports',
      child: _loading
          ? const LoadingList()
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    Text(_error!),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                  ],
                ))
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text('Platform Reports', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('Overview of platform activity and metrics', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary)),
                      const SizedBox(height: 20),
                      if (_reports != null && _reports!.isNotEmpty) ...[
                        ..._buildReportCards(),
                      ] else ...[
                        _EmptyReports(),
                      ],
                    ],
                  ),
                ),
    );
  }

  List<Widget> _buildReportCards() {
    final items = <Widget>[];
    final data = _reports!;

    // Try to display common report fields
    final summaryFields = ['totalUsers', 'totalCourses', 'totalSessions', 'totalMeetings', 'attendanceRate', 'completionRate'];
    final summaryValues = <Map<String, dynamic>>[];

    for (final field in summaryFields) {
      if (data.containsKey(field)) {
        summaryValues.add({'key': field, 'value': data[field]});
      }
    }

    if (summaryValues.isNotEmpty) {
      items.add(
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
              Text('Summary', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              for (final item in summaryValues)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Text(
                        _formatKey(item['key'] as String),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary),
                      ),
                      const Spacer(),
                      Text(
                        item['value']?.toString() ?? 'N/A',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: DiklyColors.primary),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
      items.add(const SizedBox(height: 16));
    }

    // Show raw data for other fields
    final otherFields = data.keys.where((k) => !summaryFields.contains(k) && k != 'success' && k != 'status').toList();
    for (final key in otherFields) {
      final value = data[key];
      if (value == null) continue;

      items.add(
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: DiklyColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_formatKey(key), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              if (value is List)
                Text('${value.length} records', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary))
              else if (value is Map)
                for (final entry in (value as Map).entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Text(_formatKey(entry.key.toString()), style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 13)),
                        const Spacer(),
                        Text(entry.value?.toString() ?? 'N/A', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      ],
                    ),
                  )
              else
                Text(value.toString(), style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      );
    }

    return items;
  }

  String _formatKey(String key) {
    return key
        .replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m.group(0)}')
        .replaceFirst(RegExp(r'^.'), key[0].toUpperCase())
        .trim();
  }
}

class _EmptyReports extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(40),
      alignment: Alignment.center,
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(Icons.bar_chart_rounded, color: DiklyColors.primary, size: 36),
          ),
          const SizedBox(height: 16),
          Text('No report data', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Report data will appear here once available', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
