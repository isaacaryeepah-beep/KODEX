import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../models/course.dart';
import '../../providers/courses_provider.dart';

class LecturerAssignmentsScreen extends ConsumerStatefulWidget {
  const LecturerAssignmentsScreen({super.key});

  @override
  ConsumerState<LecturerAssignmentsScreen> createState() =>
      _LecturerAssignmentsScreenState();
}

class _LecturerAssignmentsScreenState
    extends ConsumerState<LecturerAssignmentsScreen> {
  List<Assignment> _assignments = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAssignments();
  }

  Future<void> _loadAssignments() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await apiService.getAssignments();
      setState(() {
        _assignments = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _showCreateSheet(List<Course> courses) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CreateAssignmentSheet(
        courses: courses,
        onSaved: () {
          Navigator.of(context).pop();
          _loadAssignments();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              'Assignments',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            Text(
              'Create, schedule and grade student assignments',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w400,
                color: DiklyColors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: () {
                final courses =
                    coursesAsync.asData?.value ?? <Course>[];
                _showCreateSheet(courses);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text(
                'New Assignment',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAssignments,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline,
                              size: 48, color: DiklyColors.error),
                          const SizedBox(height: 12),
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                color: DiklyColors.textSecondary),
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: _loadAssignments,
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  )
                : _assignments.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          const SizedBox(height: 40),
                          Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 72,
                                  height: 72,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEFF6FF),
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                  child: const Icon(
                                    Icons.assignment_outlined,
                                    size: 36,
                                    color: Color(0xFF2563EB),
                                  ),
                                ),
                                const SizedBox(height: 20),
                                const Text(
                                  'No assignments yet',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    color: DiklyColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'Tap "+ New Assignment" to create your first assignment.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: DiklyColors.textSecondary,
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _assignments.length,
                        itemBuilder: (ctx, i) =>
                            _AssignmentCard(assignment: _assignments[i]),
                      ),
      ),
    );
  }
}

// ---------- Assignment Card ----------

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;

  const _AssignmentCard({required this.assignment});

  @override
  Widget build(BuildContext context) {
    final isClosed = assignment.status == 'closed' ||
        assignment.status == 'archived';
    final hasBrief = assignment.description != null &&
        assignment.description!.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Course label + submission count
          Row(
            children: [
              if (assignment.courseName != null) ...[
                Text(
                  assignment.courseName!.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF2563EB),
                    letterSpacing: 0.3,
                  ),
                ),
              ],
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text(
                    '—',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                  const Text(
                    'SUBMISSIONS',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF2563EB),
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Title
          Text(
            assignment.title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          // Status chips
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (isClosed)
                _StatusChip(
                  label: 'Closed',
                  color: DiklyColors.error,
                ),
              if (assignment.dueDate != null)
                _StatusChip(
                  label:
                      'Due ${DateFormat('MMM d').format(assignment.dueDate!)}',
                  color: const Color(0xFFF59E0B),
                ),
              if (hasBrief)
                const _StatusChip(
                  label: 'Brief',
                  color: DiklyColors.textSecondary,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

// ---------- Create Assignment Bottom Sheet ----------

class _CreateAssignmentSheet extends ConsumerStatefulWidget {
  final List<Course> courses;
  final VoidCallback onSaved;

  const _CreateAssignmentSheet({
    required this.courses,
    required this.onSaved,
  });

  @override
  ConsumerState<_CreateAssignmentSheet> createState() =>
      _CreateAssignmentSheetState();
}

class _CreateAssignmentSheetState
    extends ConsumerState<_CreateAssignmentSheet> {
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  Course? _selectedCourse;
  DateTime? _releaseDate;
  DateTime? _dueDate;
  bool _allowFile = true;
  bool _allowLate = false;
  bool _saving = false;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isDue) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 730)),
    );
    if (picked != null) {
      setState(() {
        if (isDue) {
          _dueDate = picked;
        } else {
          _releaseDate = picked;
        }
      });
    }
  }

  Future<void> _save() async {
    if (_titleCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a title')),
      );
      return;
    }
    if (_selectedCourse == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a course')),
      );
      return;
    }
    if (_releaseDate == null || _dueDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please set release and due dates')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await apiService.createAssignment({
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'courseId': _selectedCourse!.id,
        'courseName': _selectedCourse!.title,
        'releaseDate': _releaseDate!.toIso8601String(),
        'dueDate': _dueDate!.toIso8601String(),
        'allowFileSubmission': _allowFile,
        'allowLateSubmission': _allowLate,
      });
      widget.onSaved();
    } catch (e) {
      setState(() => _saving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString()}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM d, yyyy');
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: DiklyColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              // Header
              const Text(
                'New Assignment',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 20),
              // BASIC INFO
              _SectionLabel('BASIC INFO'),
              const SizedBox(height: 8),
              _FieldLabel('TITLE *'),
              const SizedBox(height: 4),
              TextField(
                controller: _titleCtrl,
                decoration: const InputDecoration(
                  hintText: 'e.g. Research Report — Climate Change',
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
              const SizedBox(height: 14),
              _FieldLabel('DESCRIPTION (optional)'),
              const SizedBox(height: 4),
              TextField(
                controller: _descCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Brief overview visible to students...',
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
              const SizedBox(height: 14),
              _FieldLabel('COURSE *'),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: DiklyColors.border),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<Course>(
                    isExpanded: true,
                    value: _selectedCourse,
                    hint: const Text(
                      'Select a course',
                      style: TextStyle(
                          color: DiklyColors.textSecondary, fontSize: 14),
                    ),
                    items: widget.courses
                        .map(
                          (c) => DropdownMenuItem(
                            value: c,
                            child: Text(c.title,
                                style: const TextStyle(fontSize: 14)),
                          ),
                        )
                        .toList(),
                    onChanged: (c) => setState(() => _selectedCourse = c),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              // SCHEDULE
              _SectionLabel('SCHEDULE'),
              const SizedBox(height: 8),
              _FieldLabel('RELEASE DATE *'),
              const SizedBox(height: 4),
              _DateField(
                date: _releaseDate,
                hint: 'Select release date',
                onTap: () => _pickDate(false),
                fmt: fmt,
              ),
              const SizedBox(height: 14),
              _FieldLabel('DUE DATE *'),
              const SizedBox(height: 4),
              _DateField(
                date: _dueDate,
                hint: 'Select due date',
                onTap: () => _pickDate(true),
                fmt: fmt,
              ),
              const SizedBox(height: 10),
              CheckboxListTile(
                value: _allowFile,
                onChanged: (v) => setState(() => _allowFile = v ?? true),
                title: const Text('Allow file submission',
                    style: TextStyle(fontSize: 14)),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),
              CheckboxListTile(
                value: _allowLate,
                onChanged: (v) => setState(() => _allowLate = v ?? false),
                title: const Text('Allow late submission',
                    style: TextStyle(fontSize: 14)),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),
              const SizedBox(height: 14),
              // Brief upload
              _FieldLabel(
                  'ASSIGNMENT BRIEF (optional — PDF / Word, max 15 MB)'),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: () {},
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    border: Border.all(
                      color: DiklyColors.border,
                      style: BorderStyle.solid,
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: const [
                      Icon(Icons.upload_file_outlined,
                          size: 28, color: DiklyColors.textSecondary),
                      SizedBox(height: 6),
                      Text(
                        'Tap to attach brief',
                        style: TextStyle(
                            fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              // Actions
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: DiklyColors.textSecondary,
                        side: const BorderSide(color: DiklyColors.border),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              '💾  Save Assignment',
                              style: TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: DiklyColors.textSecondary,
        letterSpacing: 1,
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String label;
  const _FieldLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: DiklyColors.textSecondary,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  final DateTime? date;
  final String hint;
  final VoidCallback onTap;
  final DateFormat fmt;

  const _DateField({
    required this.date,
    required this.hint,
    required this.onTap,
    required this.fmt,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: DiklyColors.border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined,
                size: 16, color: DiklyColors.textSecondary),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                date != null ? fmt.format(date!) : hint,
                style: TextStyle(
                  fontSize: 14,
                  color: date != null
                      ? DiklyColors.textPrimary
                      : DiklyColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
