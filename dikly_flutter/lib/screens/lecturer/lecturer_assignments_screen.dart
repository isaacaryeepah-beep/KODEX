import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../models/course.dart';

class LecturerAssignmentsScreen extends ConsumerStatefulWidget {
  const LecturerAssignmentsScreen({super.key});

  @override
  ConsumerState<LecturerAssignmentsScreen> createState() =>
      _LecturerAssignmentsScreenState();
}

class _LecturerAssignmentsScreenState
    extends ConsumerState<LecturerAssignmentsScreen> {
  List<Assignment> _assignments = [];
  List<Course> _courses = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        apiService.getAssignments(),
        apiService.getCourses(),
      ]);
      setState(() {
        _assignments = results[0] as List<Assignment>;
        _courses = results[1] as List<Course>;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _showNewAssignmentSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(20),
        ),
      ),
      builder: (_) => _NewAssignmentSheet(
        courses: _courses,
        onSaved: () {
          Navigator.of(context).pop();
          _load();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Header row
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Assignments',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF111827),
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Create, schedule and grade student assignments',
                        style: TextStyle(
                            fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: _showNewAssignmentSheet,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text(
                    '+ New Assignment',
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_assignments.isEmpty)
              Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Center(
                  child: Text(
                    'No assignments yet',
                    style: TextStyle(
                        fontSize: 14, color: Color(0xFF6B7280)),
                  ),
                ),
              )
            else
              ..._assignments.map((a) => _AssignmentCard(assignment: a)),
          ],
        ),
      ),
    );
  }
}

// ── Assignment Card ───────────────────────────────────────────────────────────

class _AssignmentCard extends StatelessWidget {
  final Assignment assignment;
  const _AssignmentCard({required this.assignment});

  @override
  Widget build(BuildContext context) {
    final isClosed = assignment.status == 'closed' ||
        assignment.status == 'archived';
    final isOpen = assignment.status == 'open' ||
        assignment.status == 'active';
    final hasBrief = assignment.description != null &&
        assignment.description!.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (assignment.courseName != null)
                      Text(
                        assignment.courseName!,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      assignment.title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF111827),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: const [
                  Text(
                    '0',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                  Text(
                    'SUBMISSIONS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF9CA3AF),
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (isClosed)
                _StatusChip(
                  label: 'Closed',
                  color: DiklyColors.error,
                )
              else if (isOpen)
                _StatusChip(
                  label: 'Open',
                  color: const Color(0xFF16A34A),
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
                  color: Color(0xFF6B7280),
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
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

// ── New Assignment Bottom Sheet ───────────────────────────────────────────────

class _NewAssignmentSheet extends ConsumerStatefulWidget {
  final List<Course> courses;
  final VoidCallback onSaved;

  const _NewAssignmentSheet({
    required this.courses,
    required this.onSaved,
  });

  @override
  ConsumerState<_NewAssignmentSheet> createState() =>
      _NewAssignmentSheetState();
}

class _NewAssignmentSheetState extends ConsumerState<_NewAssignmentSheet> {
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

  InputDecoration _fieldDeco({
    String? hint,
    int? maxLines,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      hintText: hint,
      suffixIcon: suffixIcon,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide:
            const BorderSide(color: Color(0xFF2563EB), width: 2),
      ),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      filled: true,
      fillColor: Colors.white,
      hintStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
    );
  }

  Widget _sectionLabel(String text) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          text,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: Color(0xFF9CA3AF),
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 4),
        const Divider(height: 1, color: Color(0xFFE5E7EB)),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _fieldLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Color(0xFF374151),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM d, yyyy');

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                const Text(
                  'New Assignment',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF111827),
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: Color(0xFF6B7280)),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            const Divider(height: 20),
            const SizedBox(height: 4),

            // ── BASIC INFO ──
            _sectionLabel('BASIC INFO'),

            _fieldLabel('TITLE *'),
            TextField(
              controller: _titleCtrl,
              decoration: _fieldDeco(
                  hint: 'e.g. Research Report — Climate Change'),
            ),
            const SizedBox(height: 16),

            _fieldLabel('DESCRIPTION (optional)'),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: _fieldDeco(
                  hint: 'Brief overview visible to students...'),
            ),
            const SizedBox(height: 16),

            _fieldLabel('COURSE *'),
            DropdownButtonFormField<Course>(
              value: _selectedCourse,
              hint: const Text(
                'Select a course...',
                style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
              ),
              decoration: InputDecoration(
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide:
                      const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide:
                      const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(
                      color: Color(0xFF2563EB), width: 2),
                ),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 12),
                filled: true,
                fillColor: Colors.white,
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
              onChanged: (c) =>
                  setState(() => _selectedCourse = c),
            ),
            const SizedBox(height: 20),

            // ── SCHEDULE ──
            _sectionLabel('SCHEDULE'),

            _fieldLabel('RELEASE DATE *'),
            GestureDetector(
              onTap: () => _pickDate(false),
              child: AbsorbPointer(
                child: TextField(
                  readOnly: true,
                  decoration: _fieldDeco(
                    hint: _releaseDate != null
                        ? fmt.format(_releaseDate!)
                        : 'Select release date',
                    suffixIcon: const Icon(
                        Icons.calendar_today_outlined,
                        color: Color(0xFF9CA3AF),
                        size: 18),
                  ),
                  controller: TextEditingController(
                    text: _releaseDate != null
                        ? fmt.format(_releaseDate!)
                        : '',
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            _fieldLabel('DUE DATE *'),
            GestureDetector(
              onTap: () => _pickDate(true),
              child: AbsorbPointer(
                child: TextField(
                  readOnly: true,
                  decoration: _fieldDeco(
                    hint: _dueDate != null
                        ? fmt.format(_dueDate!)
                        : 'Select due date',
                    suffixIcon: const Icon(
                        Icons.calendar_today_outlined,
                        color: Color(0xFF9CA3AF),
                        size: 18),
                  ),
                  controller: TextEditingController(
                    text: _dueDate != null ? fmt.format(_dueDate!) : '',
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),

            CheckboxListTile(
              value: _allowFile,
              onChanged: (v) =>
                  setState(() => _allowFile = v ?? true),
              title: const Text('Allow file submission',
                  style: TextStyle(fontSize: 14)),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
            CheckboxListTile(
              value: _allowLate,
              onChanged: (v) =>
                  setState(() => _allowLate = v ?? false),
              title: const Text('Allow late submission',
                  style: TextStyle(fontSize: 14)),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
            const SizedBox(height: 8),

            const Text(
              'ASSIGNMENT BRIEF (optional — PDF / Word, max 15 MB)',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Color(0xFF6B7280),
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text('File upload coming soon')),
                );
              },
              child: Container(
                height: 80,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFD1D5DB)),
                ),
                child: const Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.upload_file_outlined,
                          color: Color(0xFF9CA3AF), size: 22),
                      SizedBox(width: 8),
                      Text(
                        'Tap to upload file',
                        style: TextStyle(
                            fontSize: 14, color: Color(0xFF9CA3AF)),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF6B7280),
                      side: const BorderSide(color: Color(0xFFE5E7EB)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      padding:
                          const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    icon: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.save_outlined, size: 18),
                    label: const Text(
                      'Save Assignment',
                      style: TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
