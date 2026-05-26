import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

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
      builder: (_) => _NewExpenseForm(
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
        title: const Text('Expenses'),
        backgroundColor: DiklyColors.surface,
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF0369A1),
          unselectedLabelColor: DiklyColors.textSecondary,
          indicatorColor: const Color(0xFF0369A1),
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: 'Pending'),
            Tab(text: 'Approved'),
            Tab(text: 'All'),
          ],
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
              const Text('Failed to load expenses'),
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
              _ExpenseList(
                expenses: pending,
                onRefresh: () async => ref.refresh(_expensesProvider),
                emptyMessage: 'No pending expenses',
              ),
              _ExpenseList(
                expenses: approved,
                onRefresh: () async => ref.refresh(_expensesProvider),
                emptyMessage: 'No approved expenses',
              ),
              _ExpenseList(
                expenses: all,
                onRefresh: () async => ref.refresh(_expensesProvider),
                emptyMessage: 'No expenses found',
              ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showNewExpenseSheet,
        backgroundColor: const Color(0xFF0369A1),
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}

class _ExpenseList extends StatelessWidget {
  final List<Map<String, dynamic>> expenses;
  final Future<void> Function() onRefresh;
  final String emptyMessage;

  const _ExpenseList({
    required this.expenses,
    required this.onRefresh,
    required this.emptyMessage,
  });

  @override
  Widget build(BuildContext context) {
    if (expenses.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.receipt_long_outlined, size: 56, color: DiklyColors.border),
            const SizedBox(height: 12),
            Text(
              emptyMessage,
              style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 14),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: expenses.length,
        itemBuilder: (ctx, i) => _ExpenseCard(expense: expenses[i]),
      ),
    );
  }
}

class _ExpenseCard extends StatelessWidget {
  final Map<String, dynamic> expense;
  const _ExpenseCard({required this.expense});

  IconData _categoryIcon(String? category) {
    switch ((category ?? '').toLowerCase()) {
      case 'travel': return Icons.flight_outlined;
      case 'food':
      case 'meals': return Icons.restaurant_outlined;
      case 'accommodation':
      case 'hotel': return Icons.hotel_outlined;
      case 'fuel':
      case 'transport': return Icons.local_gas_station_outlined;
      case 'office':
      case 'supplies': return Icons.inventory_2_outlined;
      case 'medical':
      case 'health': return Icons.local_hospital_outlined;
      case 'entertainment': return Icons.celebration_outlined;
      default: return Icons.receipt_outlined;
    }
  }

  Color _categoryColor(String? category) {
    switch ((category ?? '').toLowerCase()) {
      case 'travel': return DiklyColors.primary;
      case 'food':
      case 'meals': return DiklyColors.warning;
      case 'accommodation':
      case 'hotel': return const Color(0xFF7C3AED);
      case 'fuel':
      case 'transport': return DiklyColors.success;
      case 'medical':
      case 'health': return DiklyColors.error;
      default: return DiklyColors.textSecondary;
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'approved': return DiklyColors.success;
      case 'rejected': return DiklyColors.error;
      default: return DiklyColors.warning;
    }
  }

  String _formatAmount(dynamic amount) {
    if (amount == null) return 'GHS 0.00';
    final num val = num.tryParse(amount.toString()) ?? 0;
    return 'GHS ${val.toStringAsFixed(2)}';
  }

  @override
  Widget build(BuildContext context) {
    final category = expense['category']?.toString();
    final description = expense['description']?.toString() ?? 'No description';
    final amount = expense['amount'];
    final date = expense['date']?.toString() ?? '';
    final status = expense['status']?.toString() ?? 'pending';

    final catColor = _categoryColor(category);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: catColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                _categoryIcon(category),
                color: catColor,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          description,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: DiklyColors.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        _formatAmount(amount),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (category != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: catColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            category,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: catColor,
                            ),
                          ),
                        ),
                      if (category != null) const SizedBox(width: 8),
                      if (date.isNotEmpty)
                        Text(
                          date,
                          style: const TextStyle(
                            fontSize: 11,
                            color: DiklyColors.textSecondary,
                          ),
                        ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: _statusColor(status).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: _statusColor(status),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewExpenseForm extends ConsumerStatefulWidget {
  final VoidCallback onSubmitted;
  const _NewExpenseForm({required this.onSubmitted});

  @override
  ConsumerState<_NewExpenseForm> createState() => _NewExpenseFormState();
}

class _NewExpenseFormState extends ConsumerState<_NewExpenseForm> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _category = 'Travel';
  DateTime? _date;
  bool _loading = false;

  static const _categories = [
    'Travel', 'Meals', 'Accommodation', 'Transport', 'Supplies', 'Medical', 'Entertainment', 'Other',
  ];

  @override
  void dispose() {
    _amountController.dispose();
    _descriptionController.dispose();
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

  String _formatDate(DateTime? d) =>
      d == null ? 'Select date' : '${d.day}/${d.month}/${d.year}';

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_date == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a date'),
          backgroundColor: DiklyColors.warning,
        ),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await apiService.createExpense({
        'category': _category,
        'amount': double.tryParse(_amountController.text.trim()) ?? 0,
        'description': _descriptionController.text.trim(),
        'date': _date!.toIso8601String().split('T').first,
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Expense submitted successfully'),
            backgroundColor: DiklyColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to submit: ${e.toString()}'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomPadding),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Submit Expense',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Category',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: DiklyColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              items: _categories
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) => setState(() => _category = v ?? _category),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Amount (GHS)',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _amountController,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(
                          hintText: '0.00',
                          prefixText: 'GHS ',
                          border: OutlineInputBorder(),
                        ),
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
                      const Text(
                        'Date',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      InkWell(
                        onTap: _pickDate,
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                          decoration: BoxDecoration(
                            border: Border.all(color: DiklyColors.border),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.calendar_today_outlined,
                                size: 16,
                                color: DiklyColors.textSecondary,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _formatDate(_date),
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: _date == null
                                        ? DiklyColors.textSecondary
                                        : DiklyColors.textPrimary,
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
            const SizedBox(height: 16),
            const Text(
              'Description',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: DiklyColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _descriptionController,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'Describe the expense...',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Please add a description';
                return null;
              },
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0369A1),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text(
                        'Submit Expense',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
