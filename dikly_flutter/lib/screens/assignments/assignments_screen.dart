import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../widgets/app_shell.dart';

import '../../widgets/ds/dikly_ds.dart';

class AssignmentsScreen extends ConsumerStatefulWidget {
  const AssignmentsScreen({super.key});

  @override
  ConsumerState<AssignmentsScreen> createState() => _AssignmentsScreenState();
}

class _AssignmentsScreenState extends ConsumerState<AssignmentsScreen> {
  List<Assignment> _assignments = [];
  bool _loading = true;
  String? _error;
  // Filter: 'all', 'active', 'closed'
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _loadData();
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

  List<Assignment> get _filtered {
    switch (_filter) {
      case 'active':
        return _assignments.where((a) => !a.isSubmitted && !a.isOverdue).toList();
      case 'closed':
        return _assignments.where((a) => a.isOverdue || a.isSubmitted).toList();
      default:
        return _assignments;
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canCreate = user?.role == 'lecturer' || user?.role == 'admin';
    final isLecturer = user?.role == 'lecturer' || user?.role == 'admin';

    return AppShell(
      title: 'Assignments',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Assignments',
              subtitle: '${_assignments.length} total assignment${_assignments.length == 1 ? '' : 's'}',
              action: canCreate
                  ? ElevatedButton.icon(
                      onPressed: () => _showCreateDialog(context),
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Create'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                        elevation: 0,
                      ),
                    )
                  : null,
            ),
          ),
          // Filter chips (pill style)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                _FilterChip(label: 'All', count: _assignments.length, selected: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Active',
                  count: _assignments.where((a) => !a.isSubmitted && !a.isOverdue).length,
                  selected: _filter == 'active',
                  onTap: () => setState(() => _filter = 'active'),
                  selectedColor: DiklyColors.success,
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Closed',
                  count: _assignments.where((a) => a.isOverdue || a.isSubmitted).length,
                  selected: _filter == 'closed',
                  onTap: () => setState(() => _filter = 'closed'),
                  selectedColor: DiklyColors.textLight,
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
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
                    : _filtered.isEmpty
                        ? const DiklyEmptyState(
                            icon: Icons.assignment_outlined,
                            title: 'No assignments found',
                            subtitle: 'Your assignments will appear here',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) {
                                final assignment = _filtered[index];
                                return _AssignmentCard(
                                  assignment: assignment,
                                  isLecturer: isLecturer,
                                  onTap: () => context.push('/assignments/${assignment.id}'),
                                );
                              },
                            ),
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

class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final Color? selectedColor;

  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.selectedColor,
  });

  @override
  Widget build(BuildContext context) {
    final color = selectedColor ?? DiklyColors.primary;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? color : DiklyColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? color : DiklyColors.border),
          boxShadow: selected ? [] : AppTheme.shadowSm,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : DiklyColors.textSecondary,
              ),
            ),
            const SizedBox(width: 5),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: selected ? Colors.white.withOpacity(0.25) : DiklyColors.grey100,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : DiklyColors.textLight,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;
  final bool isLecturer;
  final VoidCallback onTap;

  const _AssignmentCard({
    required this.assignment,
    required this.isLecturer,
    required this.onTap,
  });

  Color get _accentColor {
    if (assignment.isSubmitted) return DiklyColors.success;
    if (assignment.isOverdue) return DiklyColors.error;
    return DiklyColors.warning;
  }

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _accentColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  assignment.isSubmitted ? Icons.check_circle_outline_rounded : Icons.assignment_outlined,
                  color: _accentColor,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      assignment.title,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    // Course code chip
                    if (assignment.courseName != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: DiklyColors.primaryULight,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          assignment.courseName!,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.primary),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              // Due date with clock icon
              if (assignment.dueDate != null)
                DiklyInfoChip(
                  icon: Icons.access_time_outlined,
                  label: 'Due ${DateFormat('MMM d').format(assignment.dueDate!)}',
                  color: _accentColor,
                  bg: _accentColor.withOpacity(0.08),
                ),
              const Spacer(),
              // Lecturer: submission count | Student: status badge
              if (isLecturer && assignment.totalMarks != null)
                DiklyInfoChip(
                  icon: Icons.bar_chart_rounded,
                  label: '${assignment.totalMarks} marks',
                  color: DiklyColors.textSecondary,
                )
              else
                DiklyBadge(
                  label: assignment.isSubmitted ? 'Submitted' : assignment.isOverdue ? 'Overdue' : 'Pending',
                  color: _accentColor,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
