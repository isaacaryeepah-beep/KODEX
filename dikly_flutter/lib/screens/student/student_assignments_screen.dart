import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../providers/assignments_provider.dart';
import '../../widgets/ds/dikly_ds.dart';


enum _Filter { all, pending, submitted, overdue }

class StudentAssignmentsScreen extends ConsumerStatefulWidget {
  const StudentAssignmentsScreen({super.key});

  @override
  ConsumerState<StudentAssignmentsScreen> createState() =>
      _StudentAssignmentsScreenState();
}

class _StudentAssignmentsScreenState
    extends ConsumerState<StudentAssignmentsScreen> {
  _Filter _filter = _Filter.all;

  List<Assignment> _filtered(List<Assignment> all) {
    switch (_filter) {
      case _Filter.pending:
        return all.where((a) => !a.isSubmitted && !a.isOverdue).toList();
      case _Filter.submitted:
        return all.where((a) => a.isSubmitted).toList();
      case _Filter.overdue:
        return all.where((a) => a.isOverdue).toList();
      case _Filter.all:
        return all;
    }
  }

  @override
  Widget build(BuildContext context) {
    final assignmentsAsync = ref.watch(assignmentsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(assignmentsProvider),
      child: assignmentsAsync.when(
        data: (assignments) {
          final list = _filtered(assignments);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // ── Header ──────────────────────────────────────────────
              DiklyScreenHeader(
                title: 'Assignments',
                subtitle: '${assignments.length} assignment${assignments.length == 1 ? '' : 's'}',
              ),

              // ── Filter chips ─────────────────────────────────────────
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _Filter.values.map((f) {
                    final isSelected = _filter == f;
                    final label = f.name[0].toUpperCase() + f.name.substring(1);
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () => setState(() => _filter = f),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? DiklyColors.primary
                                : Colors.white,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: isSelected
                                  ? DiklyColors.primary
                                  : DiklyColors.border,
                            ),
                          ),
                          child: Text(
                            label,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: isSelected
                                  ? Colors.white
                                  : DiklyColors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 16),

              // ── List ─────────────────────────────────────────────────
              if (list.isEmpty)
                DiklyEmptyState(
                  icon: Icons.assignment_outlined,
                  title: assignments.isEmpty
                      ? 'No Assignments'
                      : 'No ${_filter == _Filter.all ? '' : _filter.name} assignments',
                  subtitle: assignments.isEmpty
                      ? 'No assignments have been posted yet.'
                      : 'Nothing in this category.',
                )
              else
                ...list.map((a) => _AssignmentCard(assignment: a)),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(assignmentsProvider),
        ),
      ),
    );
  }
}

// ── Assignment Card ─────────────────────────────────────────────────────────

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;
  const _AssignmentCard({required this.assignment});

  @override
  Widget build(BuildContext context) {
    final isSubmitted = assignment.isSubmitted;
    final isOverdue = assignment.isOverdue;

    Color statusColor;
    String statusLabel;

    if (isSubmitted) {
      statusColor = DiklyColors.success;
      statusLabel = 'Submitted';
    } else if (isOverdue) {
      statusColor = DiklyColors.error;
      statusLabel = 'Overdue';
    } else {
      statusColor = DiklyColors.warning;
      statusLabel = 'Pending';
    }

    return GestureDetector(
      onTap: () => context.push('/assignments/${assignment.id}'),
      child: DiklyCard(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        borderRadius: 10,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title + status row
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    assignment.title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: DiklyColors.text,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 10),
                DiklyBadge(label: statusLabel, color: statusColor),
              ],
            ),

            // Course chip
            if (assignment.courseName != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: DiklyColors.primaryULight,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  assignment.courseName!,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.primary,
                  ),
                ),
              ),
            ],

            // Description
            if (assignment.description != null &&
                assignment.description!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                assignment.description!,
                style: const TextStyle(
                  fontSize: 13,
                  color: DiklyColors.textSecondary,
                  height: 1.4,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],

            const SizedBox(height: 10),
            const Divider(height: 1, color: DiklyColors.border),
            const SizedBox(height: 10),

            // Due date + max score row
            Row(
              children: [
                if (assignment.dueDate != null) ...[
                  Icon(
                    Icons.schedule,
                    size: 14,
                    color: isOverdue ? DiklyColors.error : DiklyColors.textLight,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Due ${DateFormat('MMM d, y · h:mm a').format(assignment.dueDate!)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: isOverdue ? DiklyColors.error : DiklyColors.textLight,
                    ),
                  ),
                ],
                const Spacer(),
                if (assignment.totalMarks != null)
                  Text(
                    '${assignment.totalMarks} pts',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: DiklyColors.textSecondary,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
