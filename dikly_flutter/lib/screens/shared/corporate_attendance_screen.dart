import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _corporateAttendanceProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getCorporateAttendance());

class CorporateAttendanceScreen extends ConsumerStatefulWidget {
  const CorporateAttendanceScreen({super.key});

  @override
  ConsumerState<CorporateAttendanceScreen> createState() => _CorporateAttendanceScreenState();
}

class _CorporateAttendanceScreenState extends ConsumerState<CorporateAttendanceScreen> {
  late DateTime _weekStart;
  late DateTime _weekEnd;

  @override
  void initState() {
    super.initState();
    _setCurrentWeek();
  }

  void _setCurrentWeek() {
    final now = DateTime.now();
    _weekStart = now.subtract(Duration(days: now.weekday - 1));
    _weekStart = DateTime(_weekStart.year, _weekStart.month, _weekStart.day);
    _weekEnd = _weekStart.add(const Duration(days: 6));
  }

  void _previousWeek() {
    setState(() {
      _weekStart = _weekStart.subtract(const Duration(days: 7));
      _weekEnd = _weekEnd.subtract(const Duration(days: 7));
    });
  }

  void _nextWeek() {
    setState(() {
      _weekStart = _weekStart.add(const Duration(days: 7));
      _weekEnd = _weekEnd.add(const Duration(days: 7));
    });
  }

  String _formatDate(DateTime d) =>
      '${d.day}/${d.month}/${d.year}';

  String _formatShort(DateTime d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${months[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_corporateAttendanceProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Team Attendance'),
        backgroundColor: DiklyColors.surface,
      ),
      body: Column(
        children: [
          // Date Range Filter
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: _previousWeek,
                  visualDensity: VisualDensity.compact,
                  style: IconButton.styleFrom(
                    backgroundColor: DiklyColors.background,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    onTap: () async {
                      final range = await showDateRangePicker(
                        context: context,
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now().add(const Duration(days: 365)),
                        initialDateRange: DateTimeRange(start: _weekStart, end: _weekEnd),
                        builder: (ctx, child) => Theme(
                          data: Theme.of(ctx).copyWith(
                            colorScheme: const ColorScheme.light(
                              primary: Color(0xFF0369A1),
                            ),
                          ),
                          child: child!,
                        ),
                      );
                      if (range != null) {
                        setState(() {
                          _weekStart = range.start;
                          _weekEnd = range.end;
                        });
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        children: [
                          const Text(
                            'Selected Range',
                            style: TextStyle(
                              fontSize: 11,
                              color: DiklyColors.textSecondary,
                            ),
                          ),
                          Text(
                            '${_formatShort(_weekStart)} – ${_formatShort(_weekEnd)}',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: DiklyColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: _nextWeek,
                  visualDensity: VisualDensity.compact,
                  style: IconButton.styleFrom(
                    backgroundColor: DiklyColors.background,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                    const SizedBox(height: 12),
                    const Text('Failed to load attendance data'),
                    TextButton(
                      onPressed: () => ref.refresh(_corporateAttendanceProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (records) {
                if (records.isEmpty) {
                  return const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.people_outline, size: 56, color: DiklyColors.border),
                        SizedBox(height: 12),
                        Text(
                          'No attendance records found',
                          style: TextStyle(color: DiklyColors.textSecondary),
                        ),
                      ],
                    ),
                  );
                }

                // Compute summary stats
                int totalPresent = 0;
                int totalAbsent = 0;
                int totalLate = 0;
                int totalOnLeave = 0;

                for (final r in records) {
                  final status = r['status']?.toString().toLowerCase() ?? '';
                  final clockedIn = r['isClockedIn'] == true;
                  if (clockedIn || status == 'present') totalPresent++;
                  else if (status == 'absent') totalAbsent++;
                  else if (status == 'late') totalLate++;
                  else if (status == 'leave' || status == 'on_leave') totalOnLeave++;
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.refresh(_corporateAttendanceProvider),
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _SummaryStats(
                        present: totalPresent,
                        absent: totalAbsent,
                        lateCount: totalLate,
                        onLeave: totalOnLeave,
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'Employee Attendance',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      ...records.map((r) => _EmployeeAttendanceRow(
                        record: r,
                        weekStart: _weekStart,
                      )),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryStats extends StatelessWidget {
  final int present;
  final int absent;
  final int lateCount;
  final int onLeave;

  const _SummaryStats({
    required this.present,
    required this.absent,
    required this.lateCount,
    required this.onLeave,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatBox(label: 'Present', value: present.toString(), color: DiklyColors.success, icon: Icons.check_circle_outline)),
        const SizedBox(width: 8),
        Expanded(child: _StatBox(label: 'Absent', value: absent.toString(), color: DiklyColors.error, icon: Icons.cancel_outlined)),
        const SizedBox(width: 8),
        Expanded(child: _StatBox(label: 'Late', value: lateCount.toString(), color: DiklyColors.warning, icon: Icons.access_time_outlined)),
        const SizedBox(width: 8),
        Expanded(child: _StatBox(label: 'On Leave', value: onLeave.toString(), color: DiklyColors.primary, icon: Icons.event_outlined)),
      ],
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const _StatBox({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w500, color: DiklyColors.textSecondary),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _EmployeeAttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;
  final DateTime weekStart;

  const _EmployeeAttendanceRow({required this.record, required this.weekStart});

  static const _dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  Color _dotColor(String? dayStatus) {
    switch ((dayStatus ?? '').toLowerCase()) {
      case 'present':
      case 'clocked_in': return DiklyColors.success;
      case 'absent': return DiklyColors.error;
      case 'late': return DiklyColors.warning;
      case 'leave':
      case 'on_leave': return DiklyColors.primary;
      default: return DiklyColors.border;
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = record['name']?.toString() ?? record['employeeName']?.toString() ?? 'Employee';
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').take(2).map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').join()
        : 'E';

    // Try to extract per-day data
    final weekData = record['weekData'] as List? ??
        record['days'] as List? ??
        record['attendance'] as List? ??
        [];

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
          CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFF0369A1).withOpacity(0.12),
            child: Text(
              initials,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0369A1),
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
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Row(
                  children: List.generate(7, (i) {
                    String? dayStatus;
                    if (weekData.length > i) {
                      final dayRecord = weekData[i];
                      if (dayRecord is Map) {
                        dayStatus = dayRecord['status']?.toString();
                      }
                    } else {
                      // Fallback: use overall status for "today" if known
                      final today = DateTime.now();
                      final dayDate = weekStart.add(Duration(days: i));
                      if (dayDate.day == today.day &&
                          dayDate.month == today.month &&
                          dayDate.year == today.year) {
                        dayStatus = record['isClockedIn'] == true ? 'present' : record['status']?.toString();
                      }
                    }

                    final dotColor = _dotColor(dayStatus);

                    return Expanded(
                      child: Column(
                        children: [
                          Text(
                            _dayLetters[i],
                            style: const TextStyle(
                              fontSize: 9,
                              color: DiklyColors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Container(
                            width: 18,
                            height: 18,
                            decoration: BoxDecoration(
                              color: dotColor.withOpacity(dotColor == DiklyColors.border ? 0.3 : 0.15),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: dotColor.withOpacity(dotColor == DiklyColors.border ? 0.2 : 0.5),
                                width: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
