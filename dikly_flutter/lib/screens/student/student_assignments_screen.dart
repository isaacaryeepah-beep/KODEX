import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../providers/assignments_provider.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';

class StudentAssignmentsScreen extends ConsumerWidget {
  const StudentAssignmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assignmentsAsync = ref.watch(assignmentsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(assignmentsProvider),
      child: assignmentsAsync.when(
        data: (assignments) => assignments.isEmpty
            ? const EmptyState(icon: Icons.assignment_outlined, title: 'No Assignments', message: 'No assignments have been posted yet.')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: assignments.length,
                itemBuilder: (_, i) => _AssignmentCard(assignment: assignments[i]),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(assignmentsProvider)),
      ),
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;
  const _AssignmentCard({required this.assignment});

  bool get _isOverdue => assignment.dueDate != null && DateTime.now().isAfter(assignment.dueDate!) && assignment.status != 'submitted';

  @override
  Widget build(BuildContext context) {
    final color = _isOverdue ? DiklyColors.error : DiklyColors.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(assignment.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis)),
                if (assignment.status != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: assignment.status == 'submitted' ? DiklyColors.success.withOpacity(0.1) : color.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      assignment.status == 'submitted' ? 'Submitted' : (_isOverdue ? 'Overdue' : 'Pending'),
                      style: TextStyle(
                        color: assignment.status == 'submitted' ? DiklyColors.success : color,
                        fontSize: 11, fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
            if (assignment.description != null && assignment.description!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(assignment.description!, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary, height: 1.4), maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
            if (assignment.dueDate != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                Icon(Icons.schedule, size: 14, color: _isOverdue ? DiklyColors.error : DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text('Due ${DateFormat('MMM d, y · h:mm a').format(assignment.dueDate!)}',
                    style: TextStyle(fontSize: 12, color: _isOverdue ? DiklyColors.error : DiklyColors.textSecondary)),
              ]),
            ],
            if (assignment.maxScore != null) ...[
              const SizedBox(height: 4),
              Text('Max score: ${assignment.maxScore}', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            ],
          ],
        ),
      ),
    );
  }
}
