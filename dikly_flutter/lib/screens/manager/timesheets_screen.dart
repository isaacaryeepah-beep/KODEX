import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
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
  late DateTime _period;

  @override
  void initState() {
    super.initState();
    _period = DateTime(DateTime.now().year, DateTime.now().month, 1);
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

  Future<void> _pickMonth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _period,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 1),
      helpText: 'Select Month',
    );
    if (picked != null) {
      setState(() => _period = DateTime(picked.year, picked.month, 1));
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Filter by period month
    final filtered = _timesheets.where((ts) {
      final raw = (ts as Map<String, dynamic>)['date']?.toString() ?? '';
      final dt = DateTime.tryParse(raw);
      return dt == null || (dt.year == _period.year && dt.month == _period.month);
    }).toList();

    final pending = filtered.where((ts) => (ts as Map)['status'] == 'pending').length;
    final approved = filtered.where((ts) => (ts as Map)['status'] == 'approved').length;
    final totalHours = filtered.fold<double>(
      0, (s, ts) => s + (((ts as Map)['totalHours'] ?? (ts)['hours'] ?? 0) as num).toDouble());

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'Timesheets',
            subtitle: 'Review and approve employee timesheets',
          ),

          // ── Period selector ──────────────────────────────────────────
          Row(
            children: [
              Text('Period: ',
                  style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
              GestureDetector(
                onTap: _pickMonth,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        DateFormat('MMMM yyyy').format(_period),
                        style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.calendar_month_outlined, size: 15, color: DiklyColors.textMuted),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // ── Stats ─────────────────────────────────────────────────────
          if (!_loading) ...[
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.6,
              children: [
                _StatCard(value: '${filtered.length}', label: 'TOTAL', color: const Color(0xFF2563EB)),
                _StatCard(value: '$pending', label: 'PENDING REVIEW', color: const Color(0xFFD97706)),
                _StatCard(value: '$approved', label: 'APPROVED', color: const Color(0xFF059669)),
                _StatCard(value: totalHours.toStringAsFixed(0), label: 'TOTAL HOURS', color: const Color(0xFF7C3AED)),
              ],
            ),
            const SizedBox(height: 20),
          ],

          // ── Submitted Timesheets ──────────────────────────────────────
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
                Text('Submitted Timesheets',
                    style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                const SizedBox(height: 12),

                if (_loading)
                  const Center(child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  ))
                else if (_error != null)
                  DiklyErrorView(message: 'Unable to load timesheets', onRetry: _loadData)
                else if (filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text('No timesheets for this period.',
                          style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                    ),
                  )
                else
                  ...filtered.map((ts) => _TimesheetRow(ts: ts as Map<String, dynamic>)),
              ],
            ),
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
              style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 4),
          Text(label,
              textAlign: TextAlign.center,
              style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.6)),
        ],
      ),
    );
  }
}

class _TimesheetRow extends StatelessWidget {
  final Map<String, dynamic> ts;
  const _TimesheetRow({required this.ts});

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'approved': return const Color(0xFF059669);
      case 'rejected': return const Color(0xFFDC2626);
      default: return const Color(0xFFD97706);
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = (ts['user'] is Map ? ts['user']['name'] : ts['userName'])?.toString() ?? 'Unknown';
    final initials = name.trim().split(' ').map((p) => p.isNotEmpty ? p[0].toUpperCase() : '').take(2).join();
    final date = ts['date'] != null ? DateTime.tryParse(ts['date'].toString()) : null;
    final hours = (ts['totalHours'] ?? ts['hours'] ?? 0) as num;
    final status = ts['status']?.toString() ?? 'pending';
    final statusColor = _statusColor(status);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFF1D4ED8).withOpacity(0.1),
            child: Text(
              initials.isEmpty ? '?' : initials,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF1D4ED8)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                if (date != null)
                  Text(
                    DateFormat('MMM d, yyyy').format(date),
                    style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted),
                  ),
              ],
            ),
          ),
          Text('${hours.toStringAsFixed(1)}h',
              style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(status.toUpperCase(),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
          ),
        ],
      ),
    );
  }
}
