import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

class TimesheetsScreen extends StatefulWidget {
  const TimesheetsScreen({super.key});

  @override
  State<TimesheetsScreen> createState() => _TimesheetsScreenState();
}

class _TimesheetsScreenState extends State<TimesheetsScreen> {
  List<dynamic> _timesheets = [];
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
      final timesheets = await apiService.getTimesheets();
      setState(() { _timesheets = timesheets; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Timesheets',
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
              : _timesheets.isEmpty
                  ? const EmptyState(icon: Icons.schedule_outlined, title: 'No timesheets', message: 'Timesheets will appear here')
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _timesheets.length,
                        itemBuilder: (ctx, i) {
                          final ts = _timesheets[i] as Map<String, dynamic>;
                          final name = (ts['user'] is Map ? ts['user']['name'] : ts['userName'])?.toString() ?? 'Unknown';
                          final date = ts['date'] != null ? DateTime.tryParse(ts['date'].toString()) : null;
                          final hours = ts['totalHours']?.toString() ?? ts['hours']?.toString() ?? '0';
                          final status = ts['status']?.toString() ?? 'pending';

                          Color statusColor;
                          switch (status) {
                            case 'approved': statusColor = DiklyColors.success; break;
                            case 'rejected': statusColor = DiklyColors.error; break;
                            default: statusColor = DiklyColors.warning;
                          }

                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: DiklyColors.surface,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: DiklyColors.border),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: DiklyColors.primary.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(Icons.schedule_outlined, color: DiklyColors.primary, size: 22),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                                      if (date != null)
                                        Text(DateFormat('EEE, MMM d, yyyy').format(date), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
                                      Text('$hours hours', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.primary, fontWeight: FontWeight.w500)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                                  child: Text(status.toUpperCase(), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: statusColor)),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
