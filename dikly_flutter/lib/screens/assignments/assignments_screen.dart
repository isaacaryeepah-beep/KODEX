import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

class AssignmentsScreen extends ConsumerStatefulWidget {
  const AssignmentsScreen({super.key});

  @override
  ConsumerState<AssignmentsScreen> createState() => _AssignmentsScreenState();
}

class _AssignmentsScreenState extends ConsumerState<AssignmentsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Assignment> _assignments = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final assignments = await apiService.getAssignments();
      setState(() { _assignments = assignments; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<Assignment> get _pending => _assignments.where((a) => !a.isSubmitted && !a.isOverdue).toList();
  List<Assignment> get _overdue => _assignments.where((a) => a.isOverdue).toList();
  List<Assignment> get _submitted => _assignments.where((a) => a.isSubmitted).toList();

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canCreate = user?.role == 'lecturer' || user?.role == 'admin';

    return AppShell(
      title: 'Assignments',
      floatingActionButton: canCreate
          ? FloatingActionButton(
              onPressed: () => _showCreateDialog(context),
              child: const Icon(Icons.add),
            )
          : null,
      child: Column(
        children: [
          Container(
            color: DiklyColors.surface,
            child: TabBar(
              controller: _tabController,
              tabs: [
                Tab(text: 'Pending (${_pending.length})'),
                Tab(text: 'Overdue (${_overdue.length})'),
                Tab(text: 'Submitted (${_submitted.length})'),
              ],
              labelColor: DiklyColors.primary,
              unselectedLabelColor: DiklyColors.textSecondary,
              indicatorColor: DiklyColors.primary,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: _loading
                ? const LoadingList()
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                          const SizedBox(height: 12),
                          Text(_error!),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                        ],
                      ))
                    : TabBarView(
                        controller: _tabController,
                        children: [
                          _AssignmentList(assignments: _pending, emptyTitle: 'No pending assignments', onRefresh: _loadData),
                          _AssignmentList(assignments: _overdue, emptyTitle: 'No overdue assignments', onRefresh: _loadData, isOverdue: true),
                          _AssignmentList(assignments: _submitted, emptyTitle: 'No submitted assignments', onRefresh: _loadData, isSubmitted: true),
                        ],
                      ),
          ),
        ],
      ),
    );
  }

  void _showCreateDialog(BuildContext context) {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final marksCtrl = TextEditingController();
    DateTime? dueDate;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Create Assignment'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Title')),
                const SizedBox(height: 12),
                TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
                const SizedBox(height: 12),
                TextField(controller: marksCtrl, decoration: const InputDecoration(labelText: 'Total Marks'), keyboardType: TextInputType.number),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.calendar_today_outlined, color: DiklyColors.primary),
                  title: Text(dueDate == null ? 'Set Due Date' : DateFormat('MMM d, y').format(dueDate!)),
                  onTap: () async {
                    final date = await showDatePicker(context: ctx, initialDate: DateTime.now().add(const Duration(days: 7)), firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
                    if (date != null) setDialogState(() => dueDate = date);
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                Navigator.pop(ctx);
                try {
                  await apiService.createAssignment({
                    'title': titleCtrl.text.trim(),
                    'description': descCtrl.text.trim(),
                    'totalMarks': int.tryParse(marksCtrl.text),
                    if (dueDate != null) 'dueDate': dueDate!.toIso8601String(),
                  });
                  await _loadData();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Assignment created!'), backgroundColor: DiklyColors.success));
                  }
                } catch (e) {
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error));
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssignmentList extends StatelessWidget {
  final List<Assignment> assignments;
  final String emptyTitle;
  final Future<void> Function() onRefresh;
  final bool isOverdue;
  final bool isSubmitted;

  const _AssignmentList({
    required this.assignments,
    required this.emptyTitle,
    required this.onRefresh,
    this.isOverdue = false,
    this.isSubmitted = false,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: assignments.isEmpty
          ? EmptyState(icon: Icons.assignment_outlined, title: emptyTitle, message: 'Your assignments will appear here')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: assignments.length,
              itemBuilder: (context, index) {
                final assignment = assignments[index];
                return _AssignmentCard(
                  assignment: assignment,
                  isOverdue: isOverdue,
                  isSubmitted: isSubmitted,
                  onTap: () => context.push('/assignments/${assignment.id}'),
                );
              },
            ),
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;
  final bool isOverdue;
  final bool isSubmitted;
  final VoidCallback onTap;

  const _AssignmentCard({
    required this.assignment,
    required this.isOverdue,
    required this.isSubmitted,
    required this.onTap,
  });

  Color get _accentColor {
    if (isOverdue) return DiklyColors.error;
    if (isSubmitted) return DiklyColors.success;
    return DiklyColors.warning;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _accentColor.withOpacity(0.2)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: _accentColor.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: Icon(
                isSubmitted ? Icons.check_circle_outline_rounded : Icons.assignment_outlined,
                color: _accentColor,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(assignment.title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (assignment.courseName != null) ...[
                        const Icon(Icons.school_outlined, size: 12, color: DiklyColors.textSecondary),
                        const SizedBox(width: 3),
                        Text(assignment.courseName!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
                        const SizedBox(width: 8),
                      ],
                      if (assignment.dueDate != null) ...[
                        const Icon(Icons.schedule_outlined, size: 12, color: DiklyColors.textSecondary),
                        const SizedBox(width: 3),
                        Text(DateFormat('MMM d').format(assignment.dueDate!), style: TextStyle(fontSize: 12, color: _accentColor, fontWeight: FontWeight.w500)),
                      ],
                    ],
                  ),
                  if (isSubmitted && assignment.grade != null) ...[
                    const SizedBox(height: 4),
                    Text('Grade: ${assignment.grade}/${assignment.totalMarks ?? '?'}', style: TextStyle(fontSize: 12, color: DiklyColors.success, fontWeight: FontWeight.w600)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.chevron_right_rounded, color: DiklyColors.textSecondary, size: 18),
          ],
        ),
      ),
    );
  }
}
