import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _myAttendanceProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final list = await apiService.getMyAttendance();
  return list;
});

class EmployeeAttendanceScreen extends ConsumerWidget {
  const EmployeeAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_myAttendanceProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.refresh(_myAttendanceProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            const Text('Failed to load attendance'),
            TextButton(
              onPressed: () => ref.refresh(_myAttendanceProvider),
              child: const Text('Retry'),
            ),
          ]),
        ),
        data: (records) => records.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(
                    child: Column(children: [
                      Icon(Icons.check_circle_outline, size: 64, color: DiklyColors.border),
                      SizedBox(height: 12),
                      Text('No attendance records', style: TextStyle(color: DiklyColors.textSecondary)),
                    ]),
                  ),
                ],
              )
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _AttendanceSummary(records: records),
                  const SizedBox(height: 20),
                  const Text('Attendance History', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary)),
                  const SizedBox(height: 12),
                  ...records.map((r) => _AttendanceCard(record: r)),
                ],
              ),
      ),
    );
  }
}

class _AttendanceSummary extends StatelessWidget {
  final List<Map<String, dynamic>> records;
  const _AttendanceSummary({required this.records});

  @override
  Widget build(BuildContext context) {
    final present = records.where((r) => r['status'] == 'present').length;
    final absent = records.where((r) => r['status'] == 'absent').length;
    final lateCount = records.where((r) => r['status'] == 'late').length;
    final total = records.length;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0369A1), Color(0xFF2563EB)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: const Color(0xFF0369A1).withOpacity(0.25), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Attendance Summary', style: TextStyle(color: Colors.white70, fontSize: 12, letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Text('$present / $total Days Present', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 16),
        Row(children: [
          _SumStat(label: 'Present', value: present.toString(), color: const Color(0xFF86EFAC)),
          const SizedBox(width: 16),
          _SumStat(label: 'Absent', value: absent.toString(), color: const Color(0xFFFCA5A5)),
          const SizedBox(width: 16),
          _SumStat(label: 'Late', value: lateCount.toString(), color: const Color(0xFFFDE68A)),
        ]),
      ]),
    );
  }
}

class _SumStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SumStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.w700)),
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
    ]);
  }
}

class _AttendanceCard extends StatelessWidget {
  final Map<String, dynamic> record;
  const _AttendanceCard({required this.record});

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'present': return DiklyColors.success;
      case 'absent': return DiklyColors.error;
      case 'late': return DiklyColors.warning;
      case 'leave': return DiklyColors.primary;
      default: return DiklyColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = record['status']?.toString() ?? 'unknown';
    final date = record['date']?.toString() ?? '';
    final clockIn = record['clockIn']?.toString() ?? '--:--';
    final clockOut = record['clockOut']?.toString() ?? '--:--';
    final hours = record['hoursWorked']?.toString() ?? '0';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: _statusColor(status).withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              status == 'present' ? Icons.check_circle : status == 'absent' ? Icons.cancel : Icons.access_time,
              color: _statusColor(status),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(date, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: DiklyColors.textPrimary)),
              const SizedBox(height: 2),
              Text('In: $clockIn  ·  Out: $clockOut', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: _statusColor(status).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(status.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: _statusColor(status))),
            ),
            const SizedBox(height: 4),
            Text('${hours}h', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
          ]),
        ]),
      ),
    );
  }
}
