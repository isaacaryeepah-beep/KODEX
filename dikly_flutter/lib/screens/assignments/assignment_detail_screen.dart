import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';

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
        title: const Text('Assignment Details'),
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
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
              : _buildContent(isStudent),
    );
  }

  Widget _buildContent(bool isStudent) {
    final a = _assignment!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: a.isSubmitted
                  ? [DiklyColors.success, const Color(0xFF15803D)]
                  : a.isOverdue
                      ? [DiklyColors.error, const Color(0xFFB91C1C)]
                      : [DiklyColors.warning, const Color(0xFFD97706)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  a.isSubmitted ? 'SUBMITTED' : a.isOverdue ? 'OVERDUE' : 'PENDING',
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),
              Text(a.title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
              if (a.courseName != null) ...[
                const SizedBox(height: 8),
                Text(a.courseName!, style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 14)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        // Details
        _InfoContainer(children: [
          if (a.dueDate != null) _InfoRow(label: 'Due Date', value: DateFormat('EEE, MMM d, yyyy').format(a.dueDate!)),
          if (a.totalMarks != null) _InfoRow(label: 'Total Marks', value: '${a.totalMarks}'),
          _InfoRow(label: 'Status', value: a.isSubmitted ? 'Submitted' : a.isOverdue ? 'Overdue' : 'Pending'),
          if (a.submittedAt != null) _InfoRow(label: 'Submitted At', value: DateFormat('MMM d, y h:mm a').format(a.submittedAt!)),
          if (a.grade != null) _InfoRow(label: 'Grade', value: '${a.grade}/${a.totalMarks ?? '?'}'),
          if (a.feedback != null && a.feedback!.isNotEmpty) _InfoRow(label: 'Feedback', value: a.feedback!),
        ]),
        const SizedBox(height: 16),
        if (a.description != null && a.description!.isNotEmpty) ...[
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
                Text('Instructions', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text(a.description!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.6, color: DiklyColors.textSecondary)),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        // Submission form
        if (isStudent && !a.isSubmitted) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: DiklyColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.primary.withOpacity(0.3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Submit Your Work', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
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
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submitAssignment,
                    child: _submitting
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('Submit Assignment'),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 32),
      ],
    );
  }
}

class _InfoContainer extends StatelessWidget {
  final List<Widget> children;
  const _InfoContainer({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(children: children),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 110, child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary))),
          Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
