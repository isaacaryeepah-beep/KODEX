import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

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
    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: Column(
        children: [
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: DiklyScreenHeader(
              title: 'Timesheets',
              subtitle: '${_timesheets.length} records',
              padding: EdgeInsets.zero,
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                            const SizedBox(height: 12),
                            const Text(
                              'Unable to load data. Pull down to refresh.',
                              style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : _timesheets.isEmpty
                        ? const DiklyEmptyState(
                            icon: Icons.schedule_outlined,
                            title: 'No timesheets',
                            subtitle: 'Timesheets will appear here',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _timesheets.length,
                              itemBuilder: (ctx, i) {
                                final ts = _timesheets[i] as Map<String, dynamic>;
                                final name = (ts['user'] is Map ? ts['user']['name'] : ts['userName'])?.toString() ?? 'Unknown';
                                final initials = name.trim().split(' ').map((p) => p.isNotEmpty ? p[0].toUpperCase() : '').take(2).join();
                                final date = ts['date'] != null ? DateTime.tryParse(ts['date'].toString()) : null;
                                final weekEnd = date != null ? date.add(const Duration(days: 6)) : null;
                                final hours = ts['totalHours']?.toString() ?? ts['hours']?.toString() ?? '0';
                                final status = ts['status']?.toString() ?? 'pending';

                                Color statusColor;
                                switch (status) {
                                  case 'approved': statusColor = DiklyColors.success; break;
                                  case 'rejected': statusColor = DiklyColors.error; break;
                                  default: statusColor = DiklyColors.warning;
                                }

                                return DiklyCard(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.all(14),
                                  child: Row(
                                    children: [
                                      // Employee initials circle
                                      CircleAvatar(
                                        radius: 22,
                                        backgroundColor: DiklyColors.primary.withOpacity(0.1),
                                        child: Text(
                                          initials.isEmpty ? '?' : initials,
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w700,
                                            color: DiklyColors.primary,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              name,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 14,
                                                color: DiklyColors.textPrimary,
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            if (date != null)
                                              Text(
                                                weekEnd != null
                                                    ? '${DateFormat('MMM d').format(date)} – ${DateFormat('MMM d, yyyy').format(weekEnd)}'
                                                    : DateFormat('EEE, MMM d, yyyy').format(date),
                                                style: const TextStyle(
                                                  fontSize: 12,
                                                  color: DiklyColors.textSecondary,
                                                ),
                                              ),
                                            const SizedBox(height: 4),
                                            Row(
                                              children: [
                                                const Icon(Icons.access_time_outlined, size: 13, color: DiklyColors.primary),
                                                const SizedBox(width: 4),
                                                Text(
                                                  '$hours hrs worked',
                                                  style: const TextStyle(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w600,
                                                    color: DiklyColors.primary,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                      DiklyBadge(
                                        label: status.toUpperCase(),
                                        color: statusColor,
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
