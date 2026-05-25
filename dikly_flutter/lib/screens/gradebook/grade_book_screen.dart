import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/stat_card.dart';

class GradeBookScreen extends ConsumerStatefulWidget {
  const GradeBookScreen({super.key});

  @override
  ConsumerState<GradeBookScreen> createState() => _GradeBookScreenState();
}

class _GradeBookScreenState extends ConsumerState<GradeBookScreen> {
  List<Assignment> _assignments = [];
  bool _loading = true;
  String? _error;

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

  List<Assignment> get _gradedAssignments => _assignments.where((a) => a.grade != null).toList();
  double get _averageGrade {
    if (_gradedAssignments.isEmpty) return 0;
    final sum = _gradedAssignments.fold(0.0, (acc, a) {
      if (a.totalMarks != null && a.totalMarks! > 0) {
        return acc + (a.grade! / a.totalMarks! * 100);
      }
      return acc;
    });
    return sum / _gradedAssignments.length;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isStudent = user?.role == 'student';

    return AppShell(
      title: 'Grade Book',
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
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Summary cards
                      if (isStudent && _gradedAssignments.isNotEmpty) ...[
                        GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 1.8,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            SmallStatCard(
                              label: 'Average Score',
                              value: '${_averageGrade.toStringAsFixed(1)}%',
                              color: _averageGrade >= 70 ? DiklyColors.success : _averageGrade >= 50 ? DiklyColors.warning : DiklyColors.error,
                              icon: Icons.grade_rounded,
                            ),
                            SmallStatCard(
                              label: 'Graded',
                              value: '${_gradedAssignments.length}/${_assignments.length}',
                              color: DiklyColors.primary,
                              icon: Icons.assignment_turned_in_outlined,
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        // GPA Progress bar
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: DiklyColors.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: DiklyColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text('Overall Performance', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                                  Text('${_averageGrade.toStringAsFixed(1)}%', style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: _averageGrade >= 70 ? DiklyColors.success : _averageGrade >= 50 ? DiklyColors.warning : DiklyColors.error,
                                  )),
                                ],
                              ),
                              const SizedBox(height: 10),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: _averageGrade / 100,
                                  backgroundColor: DiklyColors.border,
                                  color: _averageGrade >= 70 ? DiklyColors.success : _averageGrade >= 50 ? DiklyColors.warning : DiklyColors.error,
                                  minHeight: 8,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _averageGrade >= 70 ? 'Excellent performance!' : _averageGrade >= 50 ? 'Good, keep improving!' : 'Needs improvement',
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                      Text('Assignment Grades', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 12),
                      if (_assignments.isEmpty)
                        const EmptyState(icon: Icons.grade_outlined, title: 'No assignments', message: 'Your grades will appear here')
                      else
                        for (final assignment in _assignments)
                          _GradeRow(assignment: assignment),
                    ],
                  ),
                ),
    );
  }
}

class _GradeRow extends StatelessWidget {
  final Assignment assignment;
  const _GradeRow({required this.assignment});

  Color get _gradeColor {
    if (assignment.grade == null) return DiklyColors.textSecondary;
    if (assignment.totalMarks == null) return DiklyColors.primary;
    final pct = assignment.grade! / assignment.totalMarks! * 100;
    if (pct >= 70) return DiklyColors.success;
    if (pct >= 50) return DiklyColors.warning;
    return DiklyColors.error;
  }

  String get _gradeLabel {
    if (!assignment.isSubmitted) return 'Not Submitted';
    if (assignment.grade == null) return 'Pending';
    if (assignment.totalMarks != null) {
      return '${assignment.grade}/${assignment.totalMarks}';
    }
    return '${assignment.grade}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: _gradeColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              assignment.grade != null ? Icons.grade_rounded : Icons.assignment_outlined,
              color: _gradeColor,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(assignment.title, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                if (assignment.courseName != null)
                  Text(assignment.courseName!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
                if (assignment.feedback != null && assignment.feedback!.isNotEmpty)
                  Text('Feedback: ${assignment.feedback}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(_gradeLabel, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _gradeColor)),
              if (assignment.grade != null && assignment.totalMarks != null) ...[
                const SizedBox(height: 2),
                Text(
                  '${(assignment.grade! / assignment.totalMarks! * 100).toStringAsFixed(0)}%',
                  style: TextStyle(fontSize: 11, color: _gradeColor),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
