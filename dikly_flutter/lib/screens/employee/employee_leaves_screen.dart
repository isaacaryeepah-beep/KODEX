import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getMyLeaves());

class EmployeeLeavesScreen extends ConsumerStatefulWidget {
  const EmployeeLeavesScreen({super.key});

  @override
  ConsumerState<EmployeeLeavesScreen> createState() => _EmployeeLeavesScreenState();
}

class _EmployeeLeavesScreenState extends ConsumerState<EmployeeLeavesScreen>
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

  void _showNewLeaveSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _NewLeaveForm(
        onSubmitted: () {
          ref.refresh(_myLeavesProvider);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_myLeavesProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: Column(
        children: [
          // Header + Request Leave button + tabs
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklyScreenHeader(
                  title: 'My Leaves',
                  subtitle: 'Track and request your leave',
                  padding: const EdgeInsets.only(bottom: 12),
                  action: ElevatedButton.icon(
                    onPressed: _showNewLeaveSheet,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: DiklyColors.success,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Request Leave', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
                TabBar(
                  controller: _tabController,
                  labelColor: DiklyColors.success,
                  unselectedLabelColor: DiklyColors.textSecondary,
                  indicatorColor: DiklyColors.success,
                  labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  tabs: const [
                    Tab(text: 'Pending'),
                    Tab(text: 'Approved'),
                    Tab(text: 'Rejected'),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                    const SizedBox(height: 12),
                    const Text('Failed to load leave requests'),
                    TextButton(
                      onPressed: () => ref.refresh(_myLeavesProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (leaves) => TabBarView(
                controller: _tabController,
                children: [
                  _LeaveList(
                    leaves: leaves.where((l) => l['status'] == 'pending').toList(),
                    onRefresh: () async => ref.refresh(_myLeavesProvider),
                    emptyMessage: 'No pending leave requests',
                  ),
                  _LeaveList(
                    leaves: leaves.where((l) => l['status'] == 'approved').toList(),
                    onRefresh: () async => ref.refresh(_myLeavesProvider),
                    emptyMessage: 'No approved leave requests',
                  ),
                  _LeaveList(
                    leaves: leaves.where((l) => l['status'] == 'rejected').toList(),
                    onRefresh: () async => ref.refresh(_myLeavesProvider),
                    emptyMessage: 'No rejected leave requests',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaveList extends StatelessWidget {
  final List<Map<String, dynamic>> leaves;
  final Future<void> Function() onRefresh;
  final String emptyMessage;

  const _LeaveList({
    required this.leaves,
    required this.onRefresh,
    required this.emptyMessage,
  });

  @override
  Widget build(BuildContext context) {
    if (leaves.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.event_busy_outlined, size: 56, color: DiklyColors.border),
            const SizedBox(height: 12),
            Text(emptyMessage, style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 14)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: leaves.length,
        itemBuilder: (ctx, i) => _LeaveCard(leave: leaves[i]),
      ),
    );
  }
}

class _LeaveCard extends StatelessWidget {
  final Map<String, dynamic> leave;
  const _LeaveCard({required this.leave});

  Color _typeColor(String type) {
    switch (type.toLowerCase()) {
      case 'annual leave':
      case 'annual': return DiklyColors.primary;
      case 'sick leave':
      case 'sick': return DiklyColors.error;
      case 'emergency': return DiklyColors.warning;
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

  IconData _typeIcon(String type) {
    switch (type.toLowerCase()) {
      case 'sick leave':
      case 'sick': return Icons.local_hospital_outlined;
      case 'emergency': return Icons.emergency_outlined;
      default: return Icons.beach_access_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = leave['type']?.toString() ?? 'Leave';
    final startDate = leave['startDate']?.toString() ?? '';
    final endDate = leave['endDate']?.toString() ?? '';
    final status = leave['status']?.toString() ?? 'pending';
    final reason = leave['reason']?.toString() ?? '';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Leave type chip
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _typeColor(type).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_typeIcon(type), size: 14, color: _typeColor(type)),
                    const SizedBox(width: 5),
                    Text(
                      type,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _typeColor(type)),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              // Status badge
              DiklyBadge(label: status.toUpperCase(), color: _statusColor(status)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.calendar_today_outlined, size: 14, color: DiklyColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                startDate == endDate ? startDate : '$startDate  →  $endDate',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.textPrimary),
              ),
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Divider(height: 1),
            const SizedBox(height: 8),
            Text(
              reason,
              style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

// ── New Leave Form (Bottom Sheet) ────────────────────────────────────────────

class _NewLeaveForm extends ConsumerStatefulWidget {
  final VoidCallback onSubmitted;
  const _NewLeaveForm({required this.onSubmitted});

  @override
  ConsumerState<_NewLeaveForm> createState() => _NewLeaveFormState();
}

class _NewLeaveFormState extends ConsumerState<_NewLeaveForm> {
  final _formKey = GlobalKey<FormState>();
  String _type = 'Annual Leave';
  DateTime? _startDate;
  DateTime? _endDate;
  final _reasonController = TextEditingController();
  bool _loading = false;

  static const _types = ['Annual Leave', 'Sick Leave', 'Emergency'];

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isStart) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? (_startDate ?? now) : (_endDate ?? (_startDate ?? now)),
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
    if (!_formKey.currentState!.validate()) return;
    if (_startDate == null || _endDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select start and end dates'), backgroundColor: DiklyColors.warning),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await apiService.createLeaveRequest({
        'type': _type,
        'startDate': _startDate!.toIso8601String().split('T').first,
        'endDate': _endDate!.toIso8601String().split('T').first,
        'reason': _reasonController.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Leave request submitted successfully'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to submit: ${e.toString()}'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _formatDate(DateTime? d) =>
      d == null ? 'Select date' : '${d.day}/${d.month}/${d.year}';

  InputDecoration _fieldDeco({String? hint}) => InputDecoration(
    hintText: hint,
    filled: true,
    fillColor: DiklyColors.surface,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: DiklyColors.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: DiklyColors.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    hintStyle: const TextStyle(color: DiklyColors.textMuted, fontSize: 14),
  );

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
                const Text(
                  'New Leave Request',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Leave Type
            const DiklySectionLabel('LEAVE TYPE'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _type,
              decoration: _fieldDeco(),
              items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
              onChanged: (v) => setState(() => _type = v ?? _type),
            ),
            const SizedBox(height: 16),

            // Date range
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const DiklySectionLabel('START DATE'),
                      const SizedBox(height: 6),
                      InkWell(
                        onTap: () => _pickDate(true),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                          decoration: BoxDecoration(
                            border: Border.all(color: DiklyColors.border),
                            borderRadius: BorderRadius.circular(8),
                            color: DiklyColors.surface,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today_outlined, size: 16, color: DiklyColors.textSecondary),
                              const SizedBox(width: 8),
                              Text(
                                _formatDate(_startDate),
                                style: TextStyle(
                                  fontSize: 14,
                                  color: _startDate == null ? DiklyColors.textSecondary : DiklyColors.textPrimary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const DiklySectionLabel('END DATE'),
                      const SizedBox(height: 6),
                      InkWell(
                        onTap: () => _pickDate(false),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                          decoration: BoxDecoration(
                            border: Border.all(color: DiklyColors.border),
                            borderRadius: BorderRadius.circular(8),
                            color: DiklyColors.surface,
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today_outlined, size: 16, color: DiklyColors.textSecondary),
                              const SizedBox(width: 8),
                              Text(
                                _formatDate(_endDate),
                                style: TextStyle(
                                  fontSize: 14,
                                  color: _endDate == null ? DiklyColors.textSecondary : DiklyColors.textPrimary,
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

            // Reason
            const DiklySectionLabel('REASON'),
            const SizedBox(height: 6),
            TextFormField(
              controller: _reasonController,
              maxLines: 3,
              decoration: _fieldDeco(hint: 'Describe the reason for your leave...'),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Please provide a reason';
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Submit
            DiklyPrimaryButton(
              label: 'Submit Leave Request',
              loading: _loading,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
