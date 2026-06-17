import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getMyLeaves(),
);

final _leaveBalancesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getMyLeaveBalances(),
);

class EmployeeLeavesScreen extends ConsumerStatefulWidget {
  const EmployeeLeavesScreen({super.key});

  @override
  ConsumerState<EmployeeLeavesScreen> createState() => _EmployeeLeavesScreenState();
}

class _EmployeeLeavesScreenState extends ConsumerState<EmployeeLeavesScreen> {
  // Request form state
  String _leaveType = 'Annual Leave';
  DateTime? _startDate;
  DateTime? _endDate;
  final _reasonCtrl = TextEditingController();
  bool _submitting = false;

  static const _types = ['Annual Leave', 'Sick Leave', 'Emergency', 'Other'];

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isStart) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? (_startDate ?? now) : (_endDate ?? _startDate ?? now),
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDate = picked;
          if (_endDate != null && _endDate!.isBefore(picked)) _endDate = picked;
        } else {
          _endDate = picked;
        }
      });
    }
  }

  Future<void> _submit() async {
    if (_startDate == null || _endDate == null) {
      _snack('Please select start and end dates', error: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      await apiService.createLeaveRequest({
        'type': _leaveType,
        'startDate': _startDate!.toIso8601String().split('T').first,
        'endDate': _endDate!.toIso8601String().split('T').first,
        'reason': _reasonCtrl.text.trim(),
      });
      setState(() {
        _startDate = null;
        _endDate = null;
        _reasonCtrl.clear();
      });
      ref.invalidate(_myLeavesProvider);
      ref.invalidate(_leaveBalancesProvider);
      _snack('Leave request submitted successfully');
    } catch (e) {
      _snack('Failed to submit: ${e.toString().replaceAll('Exception: ', '')}', error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? DiklyColors.error : DiklyColors.success,
    ));
  }

  String _fmt(DateTime? d) => d == null ? 'mm/dd/yyyy' : DateFormat('MM/dd/yyyy').format(d);

  @override
  Widget build(BuildContext context) {
    final leavesAsync = ref.watch(_myLeavesProvider);
    final balancesAsync = ref.watch(_leaveBalancesProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_myLeavesProvider);
        ref.invalidate(_leaveBalancesProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'My Leave',
            subtitle: 'Request and track your leave',
          ),

          // ── Balance stats ────────────────────────────────────────────────
          balancesAsync.when(
            loading: () => _BalanceShimmer(),
            error: (_, __) => const SizedBox.shrink(),
            data: (balances) => _BalanceCards(
              balances: balances,
              pendingCount: leavesAsync.valueOrNull
                      ?.where((l) => l['status'] == 'pending')
                      .length ?? 0,
            ),
          ),
          const SizedBox(height: 20),

          // ── Request Leave form ───────────────────────────────────────────
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
                Text('Request Leave',
                    style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                const SizedBox(height: 16),

                // Leave Type
                _FieldLabel('LEAVE TYPE *'),
                const SizedBox(height: 6),
                DropdownButtonFormField<String>(
                  value: _leaveType,
                  decoration: _inputDeco(),
                  items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 14)))).toList(),
                  onChanged: (v) => setState(() => _leaveType = v ?? _leaveType),
                ),
                const SizedBox(height: 12),

                // Date row
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel('START DATE *'),
                          const SizedBox(height: 6),
                          _DatePicker(
                            label: _fmt(_startDate),
                            selected: _startDate != null,
                            onTap: () => _pickDate(true),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _FieldLabel('END DATE *'),
                          const SizedBox(height: 6),
                          _DatePicker(
                            label: _fmt(_endDate),
                            selected: _endDate != null,
                            onTap: () => _pickDate(false),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Reason
                _FieldLabel('REASON (OPTIONAL)'),
                const SizedBox(height: 6),
                TextField(
                  controller: _reasonCtrl,
                  maxLines: 3,
                  decoration: _inputDeco(hint: 'Brief reason for leave...'),
                ),
                const SizedBox(height: 16),

                // Submit button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF059669),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: _submitting
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text('Submit Request', style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ── Leave history ────────────────────────────────────────────────
          Text('Leave History',
              style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
          const SizedBox(height: 12),

          leavesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => DiklyErrorView(
              message: 'Failed to load leave history',
              onRetry: () => ref.invalidate(_myLeavesProvider),
            ),
            data: (leaves) {
              if (leaves.isEmpty) {
                return const DiklyEmptyState(
                  icon: Icons.event_busy_outlined,
                  title: 'No leave requests yet',
                  subtitle: 'Your submitted leave requests will appear here',
                );
              }
              return Column(
                children: leaves.map((l) => _LeaveCard(leave: l)).toList(),
              );
            },
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  InputDecoration _inputDeco({String? hint}) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(color: DiklyColors.textMuted, fontSize: 14),
    filled: true,
    fillColor: const Color(0xFFF9FAFB),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFF059669), width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
  );
}

// ── Balance cards row ─────────────────────────────────────────────────────────

class _BalanceCards extends StatelessWidget {
  final List<Map<String, dynamic>> balances;
  final int pendingCount;

  const _BalanceCards({required this.balances, required this.pendingCount});

  @override
  Widget build(BuildContext context) {
    // Build stats from balance data
    int annualLeft = 0, sickLeft = 0, otherDaysUsed = 0;
    for (final b in balances) {
      final policy = b['policy'] as Map<String, dynamic>?;
      final code = (policy?['code'] ?? '').toString().toUpperCase();
      final daysPerYear = (policy?['daysPerYear'] ?? 0) as num;
      final used = (b['used'] ?? 0) as num;
      final left = (daysPerYear - used).clamp(0, daysPerYear).toInt();
      if (code == 'AL' || code.contains('ANNUAL')) {
        annualLeft = left;
      } else if (code == 'SL' || code.contains('SICK')) {
        sickLeft = left;
      } else {
        otherDaysUsed += used.toInt();
      }
    }

    final stats = [
      _StatData('$annualLeft', 'ANNUAL LEFT', const Color(0xFF2563EB), const Color(0xFFEFF6FF)),
      _StatData('$sickLeft', 'SICK LEFT', const Color(0xFF059669), const Color(0xFFF0FDF4)),
      _StatData('$pendingCount', 'PENDING REQUESTS', const Color(0xFFD97706), const Color(0xFFFFF7ED)),
      _StatData('$otherDaysUsed', 'OTHER DAYS USED', const Color(0xFF6B7280), const Color(0xFFF9FAFB)),
    ];

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.5,
      children: stats.map((s) => _BalanceStat(data: s)).toList(),
    );
  }
}

class _StatData {
  final String value;
  final String label;
  final Color color;
  final Color bg;
  const _StatData(this.value, this.label, this.color, this.bg);
}

class _BalanceStat extends StatelessWidget {
  final _StatData data;
  const _BalanceStat({required this.data});

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
          Text(
            data.value,
            style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: data.color),
          ),
          const SizedBox(height: 4),
          Text(
            data.label,
            textAlign: TextAlign.center,
            style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w600, color: const Color(0xFF6B7280), letterSpacing: 0.6),
          ),
        ],
      ),
    );
  }
}

class _BalanceShimmer extends StatelessWidget {
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

// ── Leave card ────────────────────────────────────────────────────────────────

class _LeaveCard extends StatelessWidget {
  final Map<String, dynamic> leave;
  const _LeaveCard({required this.leave});

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'approved': return const Color(0xFF059669);
      case 'rejected': return const Color(0xFFDC2626);
      case 'cancelled': return const Color(0xFF6B7280);
      default: return const Color(0xFFD97706);
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = leave['type']?.toString() ?? 'Leave';
    final status = leave['status']?.toString() ?? 'pending';
    final start = leave['startDate']?.toString() ?? '';
    final end = leave['endDate']?.toString() ?? '';
    final reason = leave['reason']?.toString() ?? '';
    final days = leave['days']?.toString() ?? '';
    final statusColor = _statusColor(status);

    String fmtDate(String raw) {
      try {
        return DateFormat('MMM d, yyyy').format(DateTime.parse(raw));
      } catch (_) {
        return raw;
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
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
                child: Text(type,
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status.toUpperCase(),
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.calendar_today_outlined, size: 13, color: DiklyColors.textMuted),
              const SizedBox(width: 5),
              Text(
                start == end ? fmtDate(start) : '${fmtDate(start)} → ${fmtDate(end)}',
                style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textSecondary),
              ),
              if (days.isNotEmpty) ...[
                const SizedBox(width: 8),
                Text('· $days day${days == '1' ? '' : 's'}',
                    style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted)),
              ],
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(reason,
                style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF6B7280), letterSpacing: 0.8),
    );
  }
}

class _DatePicker extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _DatePicker({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: DiklyColors.border),
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined, size: 14, color: DiklyColors.textMuted),
            const SizedBox(width: 7),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: selected ? DiklyColors.text : DiklyColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
