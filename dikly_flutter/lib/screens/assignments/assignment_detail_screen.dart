import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../widgets/ds/dikly_ds.dart';

class AssignmentDetailScreen extends ConsumerStatefulWidget {
  final String assignmentId;

  const AssignmentDetailScreen({super.key, required this.assignmentId});

  @override
  ConsumerState<AssignmentDetailScreen> createState() => _AssignmentDetailScreenState();
}

class _AssignmentDetailScreenState extends ConsumerState<AssignmentDetailScreen> {
  Assignment? _assignment;
  bool _loading = true;
  String? _error;
  bool _submitting = false;
  final _submissionController = TextEditingController();
  final _linkController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _submissionController.dispose();
    _linkController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final assignment = await apiService.getAssignmentById(widget.assignmentId);
      setState(() { _assignment = assignment; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _submitAssignment() async {
    if (_submissionController.text.trim().isEmpty && _linkController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please provide a submission or link'), backgroundColor: DiklyColors.error),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await apiService.submitAssignment(widget.assignmentId, {
        'content': _submissionController.text.trim(),
        'submissionLink': _linkController.text.trim(),
      });
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Assignment submitted successfully!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isStudent = user?.role == 'student';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: Text(_assignment?.title ?? 'Assignment'),
        leading: BackButton(onPressed: () => context.pop()),
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: DiklyColors.border, height: 1),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      'Something went wrong. Please try again.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                  ],
                ))
              : _buildContent(isStudent),
    );
  }

  Widget _buildContent(bool isStudent) {
    final a = _assignment!;

    Color headerColor1, headerColor2;
    if (a.isSubmitted) {
      headerColor1 = DiklyColors.success;
      headerColor2 = const Color(0xFF15803D);
    } else if (a.isOverdue) {
      headerColor1 = DiklyColors.error;
      headerColor2 = const Color(0xFFB91C1C);
    } else {
      headerColor1 = DiklyColors.warning;
      headerColor2 = const Color(0xFFB45309);
    }

    String statusLabel = a.isSubmitted ? 'SUBMITTED' : a.isOverdue ? 'OVERDUE' : 'PENDING';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Brief (description) card
        if (a.description != null && a.description!.isNotEmpty) ...[
          DiklyCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: headerColor1.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        statusLabel,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: headerColor1),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Instructions',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                ),
                const SizedBox(height: 8),
                Text(
                  a.description!,
                  style: const TextStyle(fontSize: 14, color: DiklyColors.textSecondary, height: 1.6),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Deadline card
        DiklyCard(
          margin: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Deadline',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
              ),
              const SizedBox(height: 12),
              if (a.dueDate != null)
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: headerColor1.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.calendar_today_outlined, color: headerColor1, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          DateFormat('EEE, MMM d, yyyy').format(a.dueDate!),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text),
                        ),
                        Text(
                          DateFormat('h:mm a').format(a.dueDate!),
                          style: const TextStyle(fontSize: 12, color: DiklyColors.textLight),
                        ),
                      ],
                    ),
                  ],
                ),
              const SizedBox(height: 12),
              // Details
              if (a.totalMarks != null)
                _DetailRow(label: 'Total Marks', value: '${a.totalMarks}'),
              _DetailRow(label: 'Status', value: a.isSubmitted ? 'Submitted' : a.isOverdue ? 'Overdue' : 'Pending'),
              if (a.submittedAt != null)
                _DetailRow(label: 'Submitted At', value: DateFormat('MMM d, y h:mm a').format(a.submittedAt!)),
              if (a.grade != null)
                _DetailRow(label: 'Grade', value: '${a.grade}/${a.totalMarks ?? '?'}'),
              if (a.feedback != null && a.feedback!.isNotEmpty)
                _DetailRow(label: 'Feedback', value: a.feedback!),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Student: Submit button / submission form
        if (isStudent && !a.isSubmitted) ...[
          DiklyCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Submit Your Work',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _submissionController,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'Your Response / Answer',
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _linkController,
                  decoration: const InputDecoration(
                    labelText: 'Submission Link (optional)',
                    prefixIcon: Icon(Icons.link_rounded),
                    hintText: 'https://...',
                  ),
                ),
                const SizedBox(height: 20),
                DiklyPrimaryButton(
                  label: 'Submit Assignment',
                  icon: Icons.check_rounded,
                  color: DiklyColors.success,
                  loading: _submitting,
                  onPressed: _submitAssignment,
                  height: 50,
                ),
              ],
            ),
          ),
        ],

        // Lecturer: Submissions list (placeholder using grade info)
        if (!isStudent && a.isSubmitted) ...[
          DiklyCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Submission Details',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                ),
                const SizedBox(height: 12),
                if (a.grade != null)
                  _DetailRow(label: 'Grade', value: '${a.grade}/${a.totalMarks ?? '?'}'),
                if (a.feedback != null)
                  _DetailRow(label: 'Feedback', value: a.feedback!),
                if (a.submittedAt != null)
                  _DetailRow(label: 'Submitted', value: DateFormat('MMM d, y h:mm a').format(a.submittedAt!)),
              ],
            ),
          ),
        ],
        const SizedBox(height: 32),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text),
            ),
          ),
        ],
      ),
    );
  }
}
