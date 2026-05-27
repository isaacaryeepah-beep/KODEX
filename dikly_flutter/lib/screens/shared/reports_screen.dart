import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

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

  static const _categories = [
    _ReportCategory(
      icon: Icons.check_circle_outline,
      title: 'Attendance',
      description: 'View attendance records, presence rates, and absence summaries for your team.',
      color: DiklyColors.success,
    ),
    _ReportCategory(
      icon: Icons.timer_outlined,
      title: 'Timesheets',
      description: 'Review hours worked, overtime, and weekly timesheet summaries.',
      color: DiklyColors.primary,
    ),
    _ReportCategory(
      icon: Icons.event_note_outlined,
      title: 'Leave Summary',
      description: 'Breakdown of leave requests, approvals, and leave balances per employee.',
      color: DiklyColors.warning,
    ),
    _ReportCategory(
      icon: Icons.bar_chart_rounded,
      title: 'Performance',
      description: 'Track team performance metrics, productivity, and key indicators.',
      color: Color(0xFF7C3AED),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Reports'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                      const SizedBox(height: 12),
                      Text(_error!),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      DiklyScreenHeader(
                        title: 'Reports',
                        subtitle: 'Generate and review workplace reports',
                      ),

                      // Summary stats from API (if any)
                      if (_reports != null && _reports!.isNotEmpty) ...[
                        _buildSummaryCard(),
                        const SizedBox(height: 16),
                      ],

                      // Report category cards
                      ..._categories.map((cat) => _ReportCategoryCard(category: cat)),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
    );
  }

  Widget _buildSummaryCard() {
    final summaryFields = ['totalUsers', 'totalSessions', 'attendanceRate', 'completionRate'];
    final values = <MapEntry<String, dynamic>>[];
    for (final field in summaryFields) {
      if (_reports!.containsKey(field)) {
        values.add(MapEntry(field, _reports![field]));
      }
    }
    if (values.isEmpty) return const SizedBox.shrink();

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Summary', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary)),
          const SizedBox(height: 12),
          ...values.map((e) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Text(_formatKey(e.key), style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                const Spacer(),
                Text(
                  e.value?.toString() ?? 'N/A',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.primary),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  String _formatKey(String key) {
    return key
        .replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m.group(0)}')
        .replaceFirst(RegExp(r'^.'), key[0].toUpperCase())
        .trim();
  }
}

class _ReportCategory {
  final IconData icon;
  final String title;
  final String description;
  final Color color;

  const _ReportCategory({
    required this.icon,
    required this.title,
    required this.description,
    required this.color,
  });
}

class _ReportCategoryCard extends StatelessWidget {
  final _ReportCategory category;
  const _ReportCategoryCard({required this.category});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: category.color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(category.icon, size: 22, color: category.color),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  category.description,
                  style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 36,
                  child: ElevatedButton(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Generating ${category.title} report...')),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: category.color,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Generate', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
