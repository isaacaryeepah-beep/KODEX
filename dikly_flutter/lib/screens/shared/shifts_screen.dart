import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _shiftsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) =>
    apiService.getShifts());

class ShiftsScreen extends ConsumerWidget {
  const ShiftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final isManager = user?.role == 'manager' || user?.role == 'admin';
    final async = ref.watch(_shiftsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.refresh(_shiftsProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DiklyScreenHeader(
              title: isManager ? 'Shift Management' : 'Shifts',
              subtitle: isManager ? 'Create shifts and assign employees' : 'View your assigned shifts',
            ),
            DiklyErrorView(message: 'Failed to load shifts', onRetry: () => ref.refresh(_shiftsProvider)),
          ],
        ),
        data: (shifts) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: isManager ? 'Shift Management' : 'Shifts',
                subtitle: isManager ? 'Create shifts and assign employees' : 'View your assigned shifts',
              ),

              // ── Create Shift form (managers/admin only) ──────────────
              if (isManager) ...[
                _CreateShiftForm(onCreated: () => ref.refresh(_shiftsProvider)),
                const SizedBox(height: 20),
              ],

              // ── Shifts list ──────────────────────────────────────────
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
                    Text('Shifts (${shifts.length})',
                        style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                    const SizedBox(height: 12),
                    if (shifts.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Center(
                          child: Text('No shifts created yet.',
                              style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                        ),
                      )
                    else
                      ...shifts.map((s) => s is Map<String, dynamic>
                          ? _ShiftRow(shift: s)
                          : const SizedBox.shrink()),
                  ],
                ),
              ),
              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }
}

// ── Create Shift inline form ─────────────────────────────────────────────────

class _CreateShiftForm extends ConsumerStatefulWidget {
  final VoidCallback onCreated;
  const _CreateShiftForm({required this.onCreated});

  @override
  ConsumerState<_CreateShiftForm> createState() => _CreateShiftFormState();
}

class _CreateShiftFormState extends ConsumerState<_CreateShiftForm> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _startCtrl = TextEditingController(text: '08:00');
  final _endCtrl = TextEditingController(text: '17:00');
  final _graceCtrl = TextEditingController(text: '15');
  final Set<String> _days = {'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'};
  bool _loading = false;

  static const _allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static const _fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _startCtrl.dispose();
    _endCtrl.dispose();
    _graceCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickTime(TextEditingController ctrl) async {
    final parts = ctrl.text.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts[0]) ?? 8,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
    );
    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(colorScheme: const ColorScheme.light(primary: Color(0xFF1D4ED8))),
        child: child!,
      ),
    );
    if (picked != null) {
      ctrl.text = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_days.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one working day'), backgroundColor: DiklyColors.warning),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await apiService.createShift({
        'name': _nameCtrl.text.trim(),
        'startTime': _startCtrl.text.trim(),
        'endTime': _endCtrl.text.trim(),
        'gracePeriod': int.tryParse(_graceCtrl.text.trim()) ?? 15,
        'days': _days.toList(),
      });
      if (mounted) {
        _nameCtrl.clear();
        _days.clear();
        _days.addAll({'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'});
        setState(() {});
        widget.onCreated();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Shift created'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Create New Shift',
                style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
            const SizedBox(height: 14),
            // Row: name + start + end + grace
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 3,
                  child: _FormField(
                    label: 'SHIFT NAME *',
                    child: TextFormField(
                      controller: _nameCtrl,
                      decoration: _inputDecoration('e.g. Morning Shift'),
                      validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
                      style: GoogleFonts.dmSans(fontSize: 13),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: _FormField(
                    label: 'START TIME *',
                    child: TextFormField(
                      controller: _startCtrl,
                      readOnly: true,
                      onTap: () => _pickTime(_startCtrl),
                      decoration: _inputDecoration('08:00').copyWith(suffixIcon: const Icon(Icons.access_time, size: 16)),
                      style: GoogleFonts.dmSans(fontSize: 13),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: _FormField(
                    label: 'END TIME *',
                    child: TextFormField(
                      controller: _endCtrl,
                      readOnly: true,
                      onTap: () => _pickTime(_endCtrl),
                      decoration: _inputDecoration('17:00').copyWith(suffixIcon: const Icon(Icons.access_time, size: 16)),
                      style: GoogleFonts.dmSans(fontSize: 13),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: _FormField(
                    label: 'GRACE PERIOD (MIN)',
                    child: TextFormField(
                      controller: _graceCtrl,
                      keyboardType: TextInputType.number,
                      decoration: _inputDecoration('15'),
                      style: GoogleFonts.dmSans(fontSize: 13),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text('WORKING DAYS',
                style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.5)),
            const SizedBox(height: 8),
            Row(
              children: List.generate(7, (i) {
                final abbr = _allDays[i];
                final full = _fullDays[i];
                final selected = _days.contains(full);
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () => setState(() {
                      if (selected) _days.remove(full); else _days.add(full);
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: selected ? const Color(0xFF1D4ED8) : Colors.transparent,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: selected ? const Color(0xFF1D4ED8) : DiklyColors.border),
                      ),
                      child: Text(abbr,
                          style: GoogleFonts.dmSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: selected ? Colors.white : DiklyColors.textSecondary,
                          )),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _loading ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1D4ED8),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                elevation: 0,
              ),
              icon: _loading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.add, size: 18),
              label: Text(_loading ? 'Creating...' : '+ Create Shift',
                  style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) => InputDecoration(
    hintText: hint,
    hintStyle: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: DiklyColors.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: DiklyColors.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: Color(0xFF1D4ED8))),
  );
}

class _FormField extends StatelessWidget {
  final String label;
  final Widget child;
  const _FormField({required this.label, required this.child});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.4)),
        const SizedBox(height: 6),
        child,
      ],
    );
  }
}

// ── Shift row in the list ─────────────────────────────────────────────────────

class _ShiftRow extends StatelessWidget {
  final Map<String, dynamic> shift;
  const _ShiftRow({required this.shift});

  static const _dayAbbrevs = {
    'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed',
    'thursday': 'Thu', 'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun',
    'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed',
    'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat', 'sun': 'Sun',
  };

  String _abbr(String d) => _dayAbbrevs[d.toLowerCase()] ?? d.substring(0, d.length.clamp(0, 3));

  @override
  Widget build(BuildContext context) {
    final name = shift['name']?.toString() ?? shift['shiftName']?.toString() ?? 'Shift';
    final startTime = shift['startTime']?.toString() ?? '--:--';
    final endTime = shift['endTime']?.toString() ?? '--:--';
    final days = shift['days'] as List? ?? [];
    final employeeCount = shift['employeeCount'] ?? shift['assignedCount'] ?? 0;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.access_time_outlined, size: 12, color: DiklyColors.textMuted),
                    const SizedBox(width: 4),
                    Text('$startTime → $endTime',
                        style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textSecondary)),
                    if (days.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Text(days.map((d) => _abbr(d.toString())).join(', '),
                          style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
                    ],
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFF1D4ED8).withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('$employeeCount emp',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1D4ED8))),
          ),
        ],
      ),
    );
  }
}
