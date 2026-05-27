import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _expensesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) =>
    apiService.getExpenses());

class ExpensesScreen extends ConsumerStatefulWidget {
  const ExpensesScreen({super.key});

  @override
  ConsumerState<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends ConsumerState<ExpensesScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _showNewExpenseSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _NewExpenseSheet(
        onSubmitted: () => ref.refresh(_expensesProvider),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_expensesProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text(
          'Expenses',
          style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.text),
        ),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(49),
          child: Container(
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: DiklyColors.border),
                top: BorderSide(color: DiklyColors.border),
              ),
            ),
            child: TabBar(
              controller: _tabController,
              labelColor: DiklyColors.primary,
              unselectedLabelColor: DiklyColors.textLight,
              indicatorColor: DiklyColors.primary,
              indicatorWeight: 2,
              labelStyle: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600),
              unselectedLabelStyle: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w400),
              tabs: const [
                Tab(text: 'Pending'),
                Tab(text: 'Approved'),
                Tab(text: 'All'),
              ],
            ),
          ),
        ),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              Text('Failed to load expenses', style: GoogleFonts.dmSans(color: DiklyColors.textSecondary)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_expensesProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (expenses) {
          final all = expenses.whereType<Map<String, dynamic>>().toList();
          final pending = all.where((e) => e['status']?.toString() == 'pending').toList();
          final approved = all.where((e) => e['status']?.toString() == 'approved').toList();

          return TabBarView(
            controller: _tabController,
            children: [
              _ExpenseList(expenses: pending, onRefresh: () async => ref.refresh(_expensesProvider), emptyMessage: 'No pending expenses'),
              _ExpenseList(expenses: approved, onRefresh: () async => ref.refresh(_expensesProvider), emptyMessage: 'No approved expenses'),
              _ExpenseList(expenses: all, onRefresh: () async => ref.refresh(_expensesProvider), emptyMessage: 'No expenses yet'),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showNewExpenseSheet,
        backgroundColor: DiklyColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: Text('New Expense', style: GoogleFonts.dmSans(fontWeight: FontWeight.w600)),
      ),
    );
  }
}

// ── Expense List ──────────────────────────────────────────────────────────────

class _ExpenseList extends StatelessWidget {
  final List<Map<String, dynamic>> expenses;
  final Future<void> Function() onRefresh;
  final String emptyMessage;

  const _ExpenseList({required this.expenses, required this.onRefresh, required this.emptyMessage});

  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return DiklyEmptyState(
        icon: Icons.receipt_long_outlined,
        title: emptyMessage,
        subtitle: 'Submitted expenses will appear here',
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
        itemCount: expenses.length,
        itemBuilder: (ctx, i) => _ExpenseCard(expense: expenses[i]),
      ),
    );
  }
}

// ── Expense Card ──────────────────────────────────────────────────────────────

class _ExpenseCard extends StatelessWidget {
  final Map<String, dynamic> expense;
  const _ExpenseCard({required this.expense});

  static final _fmt = DateFormat('MMM d, yyyy');

  IconData _icon(String? cat) {
    switch ((cat ?? '').toLowerCase()) {
      case 'travel': return Icons.flight_outlined;
      case 'meals':
      case 'food': return Icons.restaurant_outlined;
      case 'accommodation':
      case 'hotel': return Icons.hotel_outlined;
      case 'transport':
      case 'fuel': return Icons.local_gas_station_outlined;
      case 'supplies':
      case 'office': return Icons.inventory_2_outlined;
      case 'medical':
      case 'health': return Icons.local_hospital_outlined;
      case 'entertainment': return Icons.celebration_outlined;
      default: return Icons.receipt_outlined;
    }
  }

  Color _catColor(String? cat) {
    switch ((cat ?? '').toLowerCase()) {
      case 'travel': return DiklyColors.primary;
      case 'meals':
      case 'food': return DiklyColors.warning;
      case 'accommodation':
      case 'hotel': return const Color(0xFF7C3AED);
      case 'transport':
      case 'fuel': return DiklyColors.success;
      case 'medical':
      case 'health': return DiklyColors.error;
      default: return DiklyColors.textLight;
    }
  }

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'approved': return DiklyColors.success;
      case 'rejected': return DiklyColors.error;
      default: return DiklyColors.warning;
    }
  }

  @override
  Widget build(BuildContext context) {
    final category = expense['category']?.toString();
    final description = expense['description']?.toString() ?? 'No description';
    final amount = expense['amount'];
    final dateStr = expense['date']?.toString() ?? '';
    final status = expense['status']?.toString() ?? 'pending';
    final color = _catColor(category);
    final statusColor = _statusColor(status);

    DateTime? date;
    try { date = dateStr.isNotEmpty ? DateTime.parse(dateStr) : null; } catch (_) {}

    final amountNum = num.tryParse(amount?.toString() ?? '') ?? 0;

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(_icon(category), color: color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        description,
                        style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'GHS ${amountNum.toStringAsFixed(2)}',
                      style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w800, color: DiklyColors.text),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (category != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          category,
                          style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w600, color: color),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (date != null) ...[
                      const Icon(Icons.calendar_today_outlined, size: 11, color: DiklyColors.textLight),
                      const SizedBox(width: 3),
                      Text(
                        _fmt.format(date),
                        style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight),
                      ),
                    ],
                    const Spacer(),
                    DiklyBadge(
                      label: status.toUpperCase(),
                      color: statusColor,
                    ),
                  ],
                ),
              ],
            ),
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
    filled: true,
    fillColor: DiklyColors.surface,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    hintStyle: GoogleFonts.dmSans(color: DiklyColors.textMuted, fontSize: 14),
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
              // Handle
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Text(
                    'Submit Expense',
                    style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.text),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: DiklyColors.textLight, size: 20),
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const Divider(height: 20),

              const DiklySectionLabel('CATEGORY'),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: _category,
                decoration: _deco(),
                items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c, style: GoogleFonts.dmSans(fontSize: 14)))).toList(),
                onChanged: (v) => setState(() => _category = v ?? _category),
              ),
              const SizedBox(height: 14),

              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const DiklySectionLabel('AMOUNT (GHS)'),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _amountCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: _deco(hint: '0.00'),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return 'Required';
                            if (double.tryParse(v.trim()) == null) return 'Invalid amount';
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
                        const DiklySectionLabel('DATE'),
                        const SizedBox(height: 6),
                        GestureDetector(
                          onTap: _pickDate,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                            decoration: BoxDecoration(
                              color: DiklyColors.surface,
                              border: Border.all(color: DiklyColors.border),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.calendar_today_outlined, size: 16, color: DiklyColors.textLight),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _date != null ? DateFormat('MMM d, yyyy').format(_date!) : 'Select date',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 13,
                                      color: _date != null ? DiklyColors.text : DiklyColors.textMuted,
                                    ),
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

              const DiklySectionLabel('DESCRIPTION'),
              const SizedBox(height: 6),
              TextFormField(
                controller: _descCtrl,
                maxLines: 2,
                decoration: _deco(hint: 'Describe the expense...'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please add a description' : null,
              ),
              const SizedBox(height: 20),

              DiklyPrimaryButton(
                label: 'Submit Expense',
                loading: _loading,
                onPressed: _submit,
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
