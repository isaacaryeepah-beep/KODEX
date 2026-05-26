import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class CreateMeetingScreen extends ConsumerStatefulWidget {
  const CreateMeetingScreen({super.key});

  @override
  ConsumerState<CreateMeetingScreen> createState() =>
      _CreateMeetingScreenState();
}

class _CreateMeetingScreenState extends ConsumerState<CreateMeetingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _urlController = TextEditingController();
  final _durationController = TextEditingController();

  DateTime? _selectedDate;
  TimeOfDay? _selectedTime;
  String? _selectedPlatform;
  bool _loading = false;

  static const _platforms = [
    'Zoom',
    'Jitsi',
    'Google Meet',
    'Microsoft Teams',
    'Other',
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _urlController.dispose();
    _durationController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime ?? TimeOfDay.now(),
    );
    if (picked != null) {
      setState(() => _selectedTime = picked);
    }
  }

  String get _dateDisplay {
    if (_selectedDate == null) return 'Select date';
    return DateFormat('EEE, d MMM yyyy').format(_selectedDate!);
  }

  String get _timeDisplay {
    if (_selectedTime == null) return 'Select time';
    final hour = _selectedTime!.hour.toString().padLeft(2, '0');
    final minute = _selectedTime!.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedDate == null) {
      _showError('Please select a date');
      return;
    }
    if (_selectedTime == null) {
      _showError('Please select a time');
      return;
    }

    setState(() => _loading = true);
    try {
      await apiService.createMeeting({
        'title': _titleController.text.trim(),
        'description': _descriptionController.text.trim(),
        'date': DateFormat('yyyy-MM-dd').format(_selectedDate!),
        'time': _timeDisplay,
        'platform': _selectedPlatform ?? '',
        'url': _urlController.text.trim(),
        'duration': int.tryParse(_durationController.text.trim()) ?? 60,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Meeting created'),
            backgroundColor: DiklyColors.success,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        _showError('Failed to create meeting. Please try again.');
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: DiklyColors.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('New Meeting'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Title
            _SectionLabel(label: 'Title'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                hintText: 'e.g. MATH101 Study Group',
                prefixIcon: Icon(Icons.title_rounded),
              ),
              textCapitalization: TextCapitalization.sentences,
              validator: (v) =>
                  (v == null || v.trim().isEmpty)
                      ? 'Title is required'
                      : null,
            ),
            const SizedBox(height: 16),

            // Description
            _SectionLabel(label: 'Description (optional)'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                hintText: 'Add details about this meeting...',
                prefixIcon: Padding(
                  padding: EdgeInsets.only(bottom: 48),
                  child: Icon(Icons.description_outlined),
                ),
                alignLabelWithHint: true,
              ),
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 16),

            // Date & Time row
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SectionLabel(label: 'Date'),
                      const SizedBox(height: 8),
                      _TappableField(
                        icon: Icons.calendar_today_outlined,
                        value: _dateDisplay,
                        placeholder: _selectedDate == null,
                        onTap: _pickDate,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SectionLabel(label: 'Time'),
                      const SizedBox(height: 8),
                      _TappableField(
                        icon: Icons.access_time_outlined,
                        value: _timeDisplay,
                        placeholder: _selectedTime == null,
                        onTap: _pickTime,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Platform
            _SectionLabel(label: 'Platform'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedPlatform,
              hint: const Text('Select platform'),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.videocam_outlined),
              ),
              items: _platforms
                  .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                  .toList(),
              onChanged: (v) => setState(() => _selectedPlatform = v),
              validator: (v) =>
                  (v == null || v.isEmpty) ? 'Please select a platform' : null,
            ),
            const SizedBox(height: 16),

            // Meeting URL (shown when platform selected)
            if (_selectedPlatform != null) ...[
              _SectionLabel(label: 'Meeting URL'),
              const SizedBox(height: 8),
              TextFormField(
                controller: _urlController,
                decoration: InputDecoration(
                  hintText: 'https://${_selectedPlatform!.toLowerCase().replaceAll(' ', '')}.com/...',
                  prefixIcon: const Icon(Icons.link_rounded),
                ),
                keyboardType: TextInputType.url,
                autocorrect: false,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return 'Please enter the meeting URL';
                  }
                  if (!v.trim().startsWith('http')) {
                    return 'Please enter a valid URL';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
            ],

            // Duration
            _SectionLabel(label: 'Duration (minutes)'),
            const SizedBox(height: 8),
            TextFormField(
              controller: _durationController,
              decoration: const InputDecoration(
                hintText: '60',
                prefixIcon: Icon(Icons.timer_outlined),
              ),
              keyboardType: TextInputType.number,
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Duration is required';
                }
                final n = int.tryParse(v.trim());
                if (n == null || n <= 0) {
                  return 'Enter a valid duration';
                }
                return null;
              },
            ),
            const SizedBox(height: 32),

            // Submit
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _submit,
                icon: _loading
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check_rounded),
                label: Text(_loading ? 'Creating...' : 'Create Meeting'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;

  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: DiklyColors.textSecondary,
      ),
    );
  }
}

class _TappableField extends StatelessWidget {
  final IconData icon;
  final String value;
  final bool placeholder;
  final VoidCallback onTap;

  const _TappableField({
    required this.icon,
    required this.value,
    required this.placeholder,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: DiklyColors.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: DiklyColors.textSecondary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 14,
                  color: placeholder
                      ? DiklyColors.textSecondary
                      : DiklyColors.textPrimary,
                  fontWeight:
                      placeholder ? FontWeight.w400 : FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
