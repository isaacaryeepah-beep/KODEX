import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _expensesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) =>
    apiService.getExpenses());

class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final isManager = user?.role == 'manager' || user?.role == 'admin';
    final async = ref.watch(_expensesProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: Text(
          isManager ? 'Expense Claims' : 'My Expenses',
          style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.text),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(_expensesProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: isManager ? 'Expense Claims' : 'My Expenses',
                subtitle: isManager ? 'Review and approve employee expense claims' : 'Submit and track your expense claims',
              ),
              DiklyErrorView(message: 'Failed to load expenses', onRetry: () => ref.refresh(_expensesProvider)),
            ],
          ),
          data: (expenses) {
            final all = expenses.whereType<Map<String, dynamic>>().toList();
            final pending = all.where((e) => e['status']?.toString() == 'pending').toList();
            final approved = all.where((e) => e['status']?.toString() == 'approved').toList();
            final totalApproved = approved.fold<double>(
              0, (s, e) => s + (num.tryParse(e['amount']?.toString() ?? '') ?? 0).toDouble());

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                DiklyScreenHeader(
                  title: isManager ? 'Expense Claims' : 'My Expenses',
                  subtitle: isManager ? 'Review and approve employee expense claims' : 'Submit and track your expense claims',
                ),

                // ── Stats ────────────────────────────────────────────────
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.6,
                  children: [
                    _StatCard(value: '${all.length}', label: 'TOTAL CLAIMS', color: const Color(0xFF2563EB)),
                    _StatCard(value: '${pending.length}', label: 'PENDING', color: const Color(0xFFD97706)),
                    _StatCard(value: '${approved.length}', label: 'APPROVED', color: const Color(0xFF059669)),
                    _StatCard(value: 'GHS ${totalApproved.toStringAsFixed(2)}', label: 'TOTAL APPROVED (GHS)', color: const Color(0xFF7C3AED)),
                  ],
                ),
                const SizedBox(height: 16),

                // ── Claims list ──────────────────────────────────────────
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
                            child: Text('All Claims',
                                style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                          ),
                          if (!isManager)
                            ElevatedButton.icon(
                              onPressed: () => _showNewExpenseSheet(context, ref),
                              icon: const Icon(Icons.add, size: 16),
                              label: const Text('New Claim', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF2563EB),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                elevation: 0,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (all.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Center(
                            child: Text('No expense claims yet.',
                                style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                          ),
                        )
                      else
                        ...all.map((e) => _ExpenseRow(expense: e, isManager: isManager, onAction: () => ref.refresh(_expensesProvider))),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
              ],
            );
          },
        ),
      ),
      floatingActionButton: ref.watch(_expensesProvider).maybeWhen(
        data: (_) => !isManager
            ? FloatingActionButton.extended(
                onPressed: () => _showNewExpenseSheet(context, ref),
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                icon: const Icon(Icons.add),
                label: Text('New Claim', style: GoogleFonts.dmSans(fontWeight: FontWeight.w600)),
              )
            : null,
        orElse: () => null,
      ),
    );
  }

  void _showNewExpenseSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _NewExpenseSheet(onSubmitted: () => ref.refresh(_expensesProvider)),
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

class _ExpenseRow extends StatelessWidget {
  final Map<String, dynamic> expense;
  final bool isManager;
  final VoidCallback onAction;
  const _ExpenseRow({required this.expense, required this.isManager, required this.onAction});

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'approved': return const Color(0xFF059669);
      case 'rejected': return const Color(0xFFDC2626);
      default: return const Color(0xFFD97706);
    }
  }

  @override
  Widget build(BuildContext context) {
    final category = expense['category']?.toString() ?? 'Other';
    final description = expense['description']?.toString() ?? 'No description';
    final amount = num.tryParse(expense['amount']?.toString() ?? '') ?? 0;
    final status = expense['status']?.toString() ?? 'pending';
    final dateStr = expense['date']?.toString() ?? '';
    final statusColor = _statusColor(status);
    String? dateLabel;
    try {
      if (dateStr.isNotEmpty) dateLabel = DateFormat('MMM d, yyyy').format(DateTime.parse(dateStr));
    } catch (_) {}
    final employeeName = expense['employee']?['name']?.toString() ?? expense['employeeName']?.toString();

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(description,
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Text(category, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
                    if (dateLabel != null) ...[
                      const SizedBox(width: 6),
                      Text('· $dateLabel', style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
                    ],
                    if (isManager && employeeName != null) ...[
                      const SizedBox(width: 6),
                      Text('· $employeeName', style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('GHS ${amount.toStringAsFixed(2)}',
                  style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(status.toUpperCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── New Expense Sheet ─────────────────────────────────────────────────────────

class _NewExpenseSheet extends ConsumerStatefulWidget {
  final VoidCallback onSubmitted;
  const _NewExpenseSheet({required this.onSubmitted});

  @override
  ConsumerState<_NewExpenseSheet> createState() => _NewExpenseSheetState();
}

class _NewExpenseSheetState extends ConsumerState<_NewExpenseSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _category = 'Travel';
  DateTime? _date;
  bool _loading = false;

  static const _categories = [
    'Travel', 'Meals', 'Accommodation', 'Transport', 'Supplies', 'Medical', 'Entertainment', 'Other',
  ];

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_date == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a date'), backgroundColor: DiklyColors.warning),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await apiService.createExpense({
        'category': _category,
        'amount': double.tryParse(_amountCtrl.text.trim()) ?? 0,
        'description': _descCtrl.text.trim(),
        'date': _date!.toIso8601String().split('T').first,
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Expense submitted'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _deco({String? hint}) => InputDecoration(
    hintText: hint,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFF2563EB), width: 2)),
    hintStyle: GoogleFonts.dmSans(color: DiklyColors.textMuted, fontSize: 13),
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Text('Submit Expense', style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, size: 20),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const Divider(height: 20),

              Text('CATEGORY', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.5)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: _category,
                decoration: _deco(),
                items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c, style: GoogleFonts.dmSans(fontSize: 13)))).toList(),
                onChanged: (v) => setState(() => _category = v ?? _category),
              ),
              const SizedBox(height: 14),

              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('AMOUNT (GHS)', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.5)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _amountCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: _deco(hint: '0.00'),
                          style: GoogleFonts.dmSans(fontSize: 13),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return 'Required';
                            if (double.tryParse(v.trim()) == null) return 'Invalid';
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('DATE', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.5)),
                        const SizedBox(height: 6),
                        GestureDetector(
                          onTap: _pickDate,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                            decoration: BoxDecoration(
                              border: Border.all(color: DiklyColors.border),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.calendar_today_outlined, size: 15, color: DiklyColors.textMuted),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _date != null ? DateFormat('MMM d, yyyy').format(_date!) : 'Select date',
                                    style: GoogleFonts.dmSans(fontSize: 13, color: _date != null ? DiklyColors.text : DiklyColors.textMuted),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              Text('DESCRIPTION', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.5)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _descCtrl,
                maxLines: 2,
                decoration: _deco(hint: 'Describe the expense...'),
                style: GoogleFonts.dmSans(fontSize: 13),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please add a description' : null,
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    elevation: 0,
                  ),
                  child: _loading
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text('Submit Expense', style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
