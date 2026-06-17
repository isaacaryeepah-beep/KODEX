import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _empAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getMyMonthlyAttendance(),
);

class EmployeeAttendanceScreen extends ConsumerWidget {
  const EmployeeAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_empAttendanceProvider);
    final monthLabel = DateFormat('MMMM yyyy').format(DateTime.now());

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_empAttendanceProvider),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'My Attendance',
            subtitle: monthLabel,
          ),

          async.when(
            loading: () => const _StatsShimmer(),
            error: (_, __) => const SizedBox.shrink(),
            data: (monthly) {
              final records = (monthly['records'] as List?) ?? [];
              final presentDays = records.where((r) => r['status'] == 'present' || r['status'] == 'late').length;
              final lateDays = records.where((r) => r['status'] == 'late').length;
              final totalHrs = records.fold<double>(
                0, (s, r) => s + ((r['hoursWorked'] as num?)?.toDouble() ?? 0));
              final recordedDays = records.where((r) => r['clockIn']?['time'] != null || r['clockIn'] != null).length;
              final rate = recordedDays > 0 ? (presentDays / recordedDays * 100).round() : 0;

              return Column(
                children: [
                  // ── 4 stat cards ─────────────────────────────────────────
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.5,
                    children: [
                      _StatCard(value: '$rate%', label: 'ATTENDANCE RATE', color: const Color(0xFF2563EB)),
                      _StatCard(value: '$presentDays', label: 'DAYS PRESENT', color: const Color(0xFF059669)),
                      _StatCard(value: '${totalHrs.toStringAsFixed(1)}h', label: 'HOURS WORKED', color: const Color(0xFFD97706)),
                      _StatCard(value: '$lateDays', label: 'LATE ARRIVALS', color: const Color(0xFFDC2626)),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // ── Attendance Records ────────────────────────────────────
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text('Attendance Records',
                                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                            ),
                            ElevatedButton.icon(
                              onPressed: () => context.push('/sign-in-out'),
                              icon: const Icon(Icons.login_outlined, size: 14),
                              label: const Text('Clock In / Out', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF059669),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                elevation: 0,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        if (records.isEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 24),
                            child: Center(
                              child: Text(
                                'No attendance records this month. Use Clock In / Out to start.',
                                style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          )
                        else
                          ...records.reversed.take(20).map((r) => _AttendanceRow(record: r)),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value,
              style: GoogleFonts.dmSans(fontSize: 24, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 4),
          Text(label,
              textAlign: TextAlign.center,
              style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.6)),
        ],
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;
  const _AttendanceRow({required this.record});

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'present': return const Color(0xFF059669);
      case 'late': return const Color(0xFFD97706);
      case 'absent': return const Color(0xFFDC2626);
      default: return const Color(0xFF6B7280);
    }
  }

  String _fmtTime(dynamic t) {
    if (t == null) return '—';
    final s = t.toString();
    if (s.isEmpty) return '—';
    try {
      final dt = DateTime.parse(s);
      return DateFormat('h:mm a').format(dt.toLocal());
    } catch (_) {
      return s;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = (record['status'] ?? '').toString();
    final date = record['date']?.toString() ?? '';
    final clockIn = _fmtTime(record['clockIn']?['time'] ?? record['clockIn']);
    final clockOut = _fmtTime(record['clockOut']?['time'] ?? record['clockOut']);
    final hours = (record['hoursWorked'] as num?)?.toDouble() ?? 0;
    final color = _statusColor(status);

    String fmtDate(String raw) {
      try {
        return DateFormat('MMM d').format(DateTime.parse(raw));
      } catch (_) {
        return raw;
      }
    }

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Row(
        children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(fmtDate(date),
                style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text)),
          ),
          Text('$clockIn → $clockOut',
              style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
          const SizedBox(width: 10),
          Text('${hours.toStringAsFixed(1)}h',
              style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
          ),
        ],
      ),
    );
  }
}

class _StatsShimmer extends StatelessWidget {
  const _StatsShimmer();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.5,
      children: List.generate(4, (_) => Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: DiklyColors.border),
        ),
      )),
    );
  }
}
