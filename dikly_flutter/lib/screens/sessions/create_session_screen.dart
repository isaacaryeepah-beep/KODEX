import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';

class CreateSessionScreen extends ConsumerStatefulWidget {
  const CreateSessionScreen({super.key});

  @override
  ConsumerState<CreateSessionScreen> createState() => _CreateSessionScreenState();
}

class _CreateSessionScreenState extends ConsumerState<CreateSessionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  String _meetingType = 'General Meeting';
  DateTime _start = DateTime.now().add(const Duration(minutes: 5));
  DateTime _end = DateTime.now().add(const Duration(hours: 1, minutes: 5));
  String? _linkedCourseId;
  bool _loading = false;
  bool _startingNow = false;
  List<Course> _courses = [];

  final _meetingTypes = [
    'General Meeting',
    'Lecture',
    'Session',
    'Workshop',
    'Webinar',
    'Tutorial',
  ];

  @override
  void initState() {
    super.initState();
    _loadCourses();
  }

  Future<void> _loadCourses() async {
    try {
      final courses = await apiService.getCourses();
      setState(() => _courses = courses);
    } catch (_) {}
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime({required bool isStart}) async {
    final initial = isStart ? _start : _end;
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: DiklyColors.primary),
        ),
        child: child!,
      ),
    );
    if (date == null) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: DiklyColors.primary),
        ),
        child: child!,
      ),
    );
    if (time == null) return;

    final dt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    setState(() {
      if (isStart) {
        _start = dt;
        if (_end.isBefore(dt)) _end = dt.add(const Duration(hours: 1));
      } else {
        _end = dt;
      }
    });
  }

  String _fmt(DateTime dt) => DateFormat('d MMM yyyy \'at\' h:mm a').format(dt);

  Future<void> _schedule() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await apiService.createMeeting({
        'title': _titleController.text.trim(),
        'meetingType': _meetingType.toLowerCase().replaceAll(' ', '_'),
        'scheduledStart': _start.toIso8601String(),
        'scheduledEnd': _end.toIso8601String(),
        if (_descController.text.trim().isNotEmpty) 'description': _descController.text.trim(),
        if (_linkedCourseId != null) 'linkedCourseId': _linkedCourseId,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session scheduled!'), backgroundColor: DiklyColors.success),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startNow() async {
    if (_titleController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a meeting title'), backgroundColor: DiklyColors.error),
      );
      return;
    }
    setState(() => _startingNow = true);
    try {
      await apiService.createMeeting({
        'title': _titleController.text.trim(),
        'meetingType': _meetingType.toLowerCase().replaceAll(' ', '_'),
        'scheduledStart': DateTime.now().toIso8601String(),
        'scheduledEnd': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
        if (_descController.text.trim().isNotEmpty) 'description': _descController.text.trim(),
        if (_linkedCourseId != null) 'linkedCourseId': _linkedCourseId,
        'startNow': true,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session started!'), backgroundColor: DiklyColors.success),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _startingNow = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () => context.pop()),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: DiklyColors.border, height: 1),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
          children: [
            // ── Header ──────────────────────────────────────────────────
            const Text(
              'Schedule a Meeting',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
            ),
            const SizedBox(height: 6),
            const Text(
              'Fill in the details below. Start Now skips the schedule and opens immediately.',
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.4),
            ),
            const SizedBox(height: 28),

            // ── Meeting Title ────────────────────────────────────────────
            _FieldLabel(label: 'MEETING TITLE', required: true),
            const SizedBox(height: 6),
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                hintText: 'e.g. Week 5 Lecture',
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 20),

            // ── Start Date & Time ────────────────────────────────────────
            _FieldLabel(label: 'START DATE & TIME', required: true),
            const SizedBox(height: 6),
            _DateButton(value: _fmt(_start), onTap: () => _pickDateTime(isStart: true)),
            const SizedBox(height: 20),

            // ── End Date & Time ──────────────────────────────────────────
            _FieldLabel(label: 'END DATE & TIME', required: true),
            const SizedBox(height: 6),
            _DateButton(value: _fmt(_end), onTap: () => _pickDateTime(isStart: false)),
            const SizedBox(height: 20),

            // ── Description ──────────────────────────────────────────────
            _FieldLabel(label: 'DESCRIPTION', optional: true),
            const SizedBox(height: 6),
            TextFormField(
              controller: _descController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'What is this meeting about?',
              ),
            ),
            const SizedBox(height: 20),

            // ── Meeting Type ─────────────────────────────────────────────
            const _FieldLabel(label: 'MEETING TYPE'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _meetingType,
              decoration: const InputDecoration(),
              items: _meetingTypes.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
              onChanged: (v) { if (v != null) setState(() => _meetingType = v); },
            ),
            const SizedBox(height: 20),

            // ── Course ────────────────────────────────────────────────────
            const _FieldLabel(label: 'COURSE'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String?>(
              value: _linkedCourseId,
              decoration: const InputDecoration(),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('— Select a course —')),
                ..._courses.map((c) => DropdownMenuItem<String?>(
                  value: c.id,
                  child: Text(c.title, overflow: TextOverflow.ellipsis),
                )),
              ],
              onChanged: (v) => setState(() => _linkedCourseId = v),
            ),
            const SizedBox(height: 32),

            // ── Schedule button ───────────────────────────────────────────
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: (_loading || _startingNow) ? null : _schedule,
                icon: _loading
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.calendar_today_rounded, size: 18),
                label: Text(_loading ? 'Scheduling...' : 'Schedule'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // ── Start Now button ──────────────────────────────────────────
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: (_loading || _startingNow) ? null : _startNow,
                icon: _startingNow
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.play_arrow_rounded, size: 20),
                label: Text(_startingNow ? 'Starting...' : 'Start Now'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF16A34A),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Supporting widgets ────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String label;
  final bool required;
  final bool optional;

  const _FieldLabel({required this.label, this.required = false, this.optional = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF374151), letterSpacing: 0.6),
        ),
        if (required) ...[
          const SizedBox(width: 4),
          const Text(' *', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFDC2626))),
        ],
        if (optional) ...[
          const SizedBox(width: 6),
          const Text('(OPTIONAL)', style: TextStyle(fontSize: 10, color: Color(0xFF9CA3AF), letterSpacing: 0.3)),
        ],
      ],
    );
  }
}

class _DateButton extends StatelessWidget {
  final String value;
  final VoidCallback onTap;

  const _DateButton({required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFD1D5DB)),
        ),
        child: Text(
          value,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: Color(0xFF111827)),
        ),
      ),
    );
  }
}
