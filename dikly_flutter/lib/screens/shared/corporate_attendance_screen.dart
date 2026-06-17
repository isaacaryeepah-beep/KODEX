import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _corporateAttendanceProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getCorporateAttendance());

class CorporateAttendanceScreen extends ConsumerStatefulWidget {
  const CorporateAttendanceScreen({super.key});

  @override
  ConsumerState<CorporateAttendanceScreen> createState() => _CorporateAttendanceScreenState();
}

class _CorporateAttendanceScreenState extends ConsumerState<CorporateAttendanceScreen> {
  int _tabIndex = 0; // 0 = Records, 1 = Blocked Attempts
  late DateTime _from;
  late DateTime _to;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _from = now.subtract(const Duration(days: 30));
    _to = now;
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _from : _to,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: Color(0xFF1D4ED8)),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        if (isFrom) {
          _from = picked;
        } else {
          _to = picked;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_corporateAttendanceProvider);
    final dateFmt = DateFormat('MM/dd/yyyy');

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Team Attendance'),
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Tabs ────────────────────────────────────────────────────────
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _TabButton(label: 'Records', active: _tabIndex == 0, onTap: () => setState(() => _tabIndex = 0)),
                    const SizedBox(width: 8),
                    _TabButton(label: 'Blocked Attempts', active: _tabIndex == 1, onTap: () => setState(() => _tabIndex = 1)),
                  ],
                ),
                const SizedBox(height: 12),
                // ── Date range ───────────────────────────────────────────
                Row(
                  children: [
                    Text('From', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textSecondary)),
                    const SizedBox(width: 8),
                    _DateBox(date: _from, fmt: dateFmt, onTap: () => _pickDate(isFrom: true)),
                    const SizedBox(width: 10),
                    Text('To', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textSecondary)),
                    const SizedBox(width: 8),
                    _DateBox(date: _to, fmt: dateFmt, onTap: () => _pickDate(isFrom: false)),
                    const SizedBox(width: 10),
                    ElevatedButton(
                      onPressed: () => ref.refresh(_corporateAttendanceProvider),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1D4ED8),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        elevation: 0,
                      ),
                      child: Text('Filter', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
          const Divider(height: 1),

          // ── Body ────────────────────────────────────────────────────────
          Expanded(
            child: _tabIndex == 1
                ? _BlockedAttemptsView()
                : _RecordsView(
                    async: async,
                    from: _from,
                    to: _to,
                    onRefresh: () async => ref.refresh(_corporateAttendanceProvider),
                  ),
          ),
        ],
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _TabButton({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF1D4ED8) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: active ? const Color(0xFF1D4ED8) : DiklyColors.border),
        ),
        child: Text(
          label,
          style: GoogleFonts.dmSans(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: active ? Colors.white : DiklyColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _DateBox extends StatelessWidget {
  final DateTime date;
  final DateFormat fmt;
  final VoidCallback onTap;
  const _DateBox({required this.date, required this.fmt, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: DiklyColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(fmt.format(date), style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.text)),
            const SizedBox(width: 6),
            const Icon(Icons.calendar_today_outlined, size: 14, color: DiklyColors.textMuted),
          ],
        ),
      ),
    );
  }
}

class _RecordsView extends StatelessWidget {
  final AsyncValue<List<Map<String, dynamic>>> async;
  final DateTime from;
  final DateTime to;
  final Future<void> Function() onRefresh;

  const _RecordsView({required this.async, required this.from, required this.to, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => DiklyErrorView(message: 'Failed to load attendance data', onRetry: onRefresh),
      data: (records) {
        // Filter by date range
        final filtered = records.where((r) {
          final raw = r['date']?.toString() ?? '';
          final dt = DateTime.tryParse(raw);
          if (dt == null) return true;
          return !dt.isBefore(from) && !dt.isAfter(to.add(const Duration(days: 1)));
        }).toList();

        if (filtered.isEmpty) {
          return RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 20),
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Center(
                    child: Text('No attendance records found for this period.',
                        style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                  ),
                ),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: filtered.map((r) => _EmployeeAttendanceRow(record: r)).toList(),
          ),
        );
      },
    );
  }
}

class _BlockedAttemptsView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          margin: const EdgeInsets.only(top: 20),
          padding: const EdgeInsets.symmetric(vertical: 40),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Center(
            child: Text('No blocked attempts for this period.',
                style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
          ),
        ),
      ],
    );
  }
}

class _EmployeeAttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;
  const _EmployeeAttendanceRow({required this.record});

  Color _statusColor(String? s) {
    switch ((s ?? '').toLowerCase()) {
      case 'present': case 'clocked_in': return const Color(0xFF059669);
      case 'absent': return const Color(0xFFDC2626);
      case 'late': return const Color(0xFFD97706);
      case 'leave': case 'on_leave': return const Color(0xFF2563EB);
      default: return const Color(0xFF6B7280);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = record['name']?.toString() ?? record['employeeName']?.toString() ?? 'Employee';
    final initials = name.trim().split(' ').map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').take(2).join();
    final isClockedIn = record['isClockedIn'] == true;
    final status = isClockedIn ? 'present' : record['status']?.toString() ?? '';
    final color = _statusColor(status);

    final date = record['date']?.toString();
    String? dateLabel;
    if (date != null) {
      final dt = DateTime.tryParse(date);
      if (dt != null) dateLabel = DateFormat('MMM d, yyyy').format(dt);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFF1D4ED8).withOpacity(0.1),
            child: Text(initials.isEmpty ? '?' : initials,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF1D4ED8))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                if (dateLabel != null)
                  Text(dateLabel, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
              ],
            ),
          ),
          if (status.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
              child: Text(status.toUpperCase(),
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
            ),
        ],
      ),
    );
  }
}
