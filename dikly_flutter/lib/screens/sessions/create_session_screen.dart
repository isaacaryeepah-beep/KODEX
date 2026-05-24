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
  String _meetingType = 'session';
  DateTime? _scheduledStart;
  DateTime? _scheduledEnd;
  String? _linkedCourseId;
  bool _openToCompany = false;
  bool _loading = false;
  List<Course> _courses = [];

  final _meetingTypes = ['session', 'lecture', 'meeting', 'workshop', 'webinar', 'general'];

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
    super.dispose();
  }

  Future<void> _pickDateTime({required bool isStart}) async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(hours: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(DateTime.now().add(const Duration(hours: 1))),
    );
    if (time == null) return;

    final dt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    setState(() {
      if (isStart) {
        _scheduledStart = dt;
        if (_scheduledEnd == null || _scheduledEnd!.isBefore(dt)) {
          _scheduledEnd = dt.add(const Duration(hours: 1));
        }
      } else {
        _scheduledEnd = dt;
      }
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_scheduledStart == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a start time'), backgroundColor: DiklyColors.error),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await apiService.createMeeting({
        'title': _titleController.text.trim(),
        'meetingType': _meetingType,
        'scheduledStart': _scheduledStart!.toIso8601String(),
        'scheduledEnd': _scheduledEnd?.toIso8601String(),
        if (_linkedCourseId != null) 'linkedCourseId': _linkedCourseId,
        'openToCompany': _openToCompany,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session created!'), backgroundColor: DiklyColors.success),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Create Session'),
        leading: BackButton(onPressed: () => context.pop()),
        actions: [
          TextButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Create', style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _Section(title: 'Session Details', children: [
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Session Title', prefixIcon: Icon(Icons.title_outlined)),
                validator: (v) => v == null || v.trim().isEmpty ? 'Please enter a title' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _meetingType,
                decoration: const InputDecoration(labelText: 'Session Type', prefixIcon: Icon(Icons.category_outlined)),
                items: _meetingTypes.map((type) => DropdownMenuItem(
                  value: type,
                  child: Text(type[0].toUpperCase() + type.substring(1)),
                )).toList(),
                onChanged: (v) => setState(() => _meetingType = v ?? 'session'),
              ),
            ]),
            const SizedBox(height: 16),
            _Section(title: 'Schedule', children: [
              _DateTimeTile(
                label: 'Start Time',
                dateTime: _scheduledStart,
                onTap: () => _pickDateTime(isStart: true),
              ),
              const SizedBox(height: 12),
              _DateTimeTile(
                label: 'End Time',
                dateTime: _scheduledEnd,
                onTap: () => _pickDateTime(isStart: false),
              ),
            ]),
            const SizedBox(height: 16),
            if (_courses.isNotEmpty)
              _Section(title: 'Link to Course (optional)', children: [
                DropdownButtonFormField<String?>(
                  value: _linkedCourseId,
                  decoration: const InputDecoration(labelText: 'Course', prefixIcon: Icon(Icons.school_outlined)),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('No course link')),
                    ..._courses.map((c) => DropdownMenuItem(value: c.id, child: Text(c.title, overflow: TextOverflow.ellipsis))),
                  ],
                  onChanged: (v) => setState(() => _linkedCourseId = v),
                ),
              ]),
            const SizedBox(height: 16),
            _Section(title: 'Access', children: [
              SwitchListTile(
                title: const Text('Open to all company members'),
                subtitle: const Text('Anyone in the organization can join'),
                value: _openToCompany,
                onChanged: (v) => setState(() => _openToCompany = v),
                activeColor: DiklyColors.primary,
                contentPadding: EdgeInsets.zero,
              ),
            ]),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Create Session'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _Section({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: DiklyColors.textSecondary, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _DateTimeTile extends StatelessWidget {
  final String label;
  final DateTime? dateTime;
  final VoidCallback onTap;

  const _DateTimeTile({required this.label, this.dateTime, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: DiklyColors.border),
          borderRadius: BorderRadius.circular(10),
          color: DiklyColors.background,
        ),
        child: Row(
          children: [
            const Icon(Icons.schedule_outlined, size: 20, color: DiklyColors.textSecondary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                  if (dateTime != null)
                    Text(
                      DateFormat('EEE, MMM d, yyyy  h:mm a').format(dateTime!),
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: DiklyColors.textPrimary),
                    )
                  else
                    const Text('Tap to select', style: TextStyle(fontSize: 14, color: DiklyColors.textSecondary)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: DiklyColors.textSecondary),
          ],
        ),
      ),
    );
  }
}
