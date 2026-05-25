import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

final _shiftsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) =>
    apiService.getShifts());

class ShiftsScreen extends ConsumerWidget {
  const ShiftsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final isManager = user?.role == 'manager' || user?.role == 'admin';
    final async = ref.watch(_shiftsProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Shifts'),
        backgroundColor: DiklyColors.surface,
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(_shiftsProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                const SizedBox(height: 12),
                const Text('Failed to load shifts'),
                TextButton(
                  onPressed: () => ref.refresh(_shiftsProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (shifts) {
            if (shifts.isEmpty) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.schedule_outlined, size: 56, color: DiklyColors.border),
                    const SizedBox(height: 12),
                    const Text(
                      'No shifts found',
                      style: TextStyle(color: DiklyColors.textSecondary, fontSize: 14),
                    ),
                    if (isManager)
                      TextButton(
                        onPressed: () => _showCreateShiftSheet(context, ref),
                        child: const Text('Create First Shift'),
                      ),
                  ],
                ),
              );
            }

            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: shifts.length,
              itemBuilder: (ctx, i) {
                final shift = shifts[i];
                if (shift is Map<String, dynamic>) {
                  return _ShiftCard(shift: shift);
                }
                return const SizedBox.shrink();
              },
            );
          },
        ),
      ),
      floatingActionButton: isManager
          ? FloatingActionButton(
              onPressed: () => _showCreateShiftSheet(context, ref),
              backgroundColor: const Color(0xFF0369A1),
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
    );
  }

  void _showCreateShiftSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CreateShiftForm(
        onCreated: () => ref.refresh(_shiftsProvider),
      ),
    );
  }
}

class _ShiftCard extends StatelessWidget {
  final Map<String, dynamic> shift;
  const _ShiftCard({required this.shift});

  static const _dayAbbrevs = {
    'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed',
    'thursday': 'Thu', 'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun',
    'mon': 'Mon', 'tue': 'Tue', 'wed': 'Wed',
    'thu': 'Thu', 'fri': 'Fri', 'sat': 'Sat', 'sun': 'Sun',
  };

  String _abbreviateDay(String day) =>
      _dayAbbrevs[day.toLowerCase()] ?? day.substring(0, day.length.clamp(0, 3));

  @override
  Widget build(BuildContext context) {
    final name = shift['name']?.toString() ?? shift['shiftName']?.toString() ?? 'Shift';
    final startTime = shift['startTime']?.toString() ?? '--:--';
    final endTime = shift['endTime']?.toString() ?? '--:--';
    final days = shift['days'] as List? ?? [];
    final employeeCount = shift['employeeCount'] ?? shift['assignedCount'] ?? 0;
    final department = shift['department']?.toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0369A1).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.schedule,
                    color: Color(0xFF0369A1),
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                      if (department != null)
                        Text(
                          department,
                          style: const TextStyle(
                            fontSize: 12,
                            color: DiklyColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0369A1).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.people_outline, size: 14, color: Color(0xFF0369A1)),
                      const SizedBox(width: 4),
                      Text(
                        '$employeeCount',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF0369A1),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.access_time, size: 16, color: DiklyColors.textSecondary),
                const SizedBox(width: 6),
                Text(
                  '$startTime  →  $endTime',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.textPrimary,
                  ),
                ),
              ],
            ),
            if (days.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: days.map((d) {
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: DiklyColors.background,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Text(
                      _abbreviateDay(d.toString()),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CreateShiftForm extends ConsumerStatefulWidget {
  final VoidCallback onCreated;
  const _CreateShiftForm({required this.onCreated});

  @override
  ConsumerState<_CreateShiftForm> createState() => _CreateShiftFormState();
}

class _CreateShiftFormState extends ConsumerState<_CreateShiftForm> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _startTimeController = TextEditingController();
  final _endTimeController = TextEditingController();

  final Set<String> _selectedDays = {};
  bool _loading = false;

  static const _allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  @override
  void dispose() {
    _nameController.dispose();
    _startTimeController.dispose();
    _endTimeController.dispose();
    super.dispose();
  }

  Future<void> _pickTime(TextEditingController controller) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: Color(0xFF0369A1)),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      final hour = picked.hour.toString().padLeft(2, '0');
      final minute = picked.minute.toString().padLeft(2, '0');
      controller.text = '$hour:$minute';
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedDays.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select at least one day'),
          backgroundColor: DiklyColors.warning,
        ),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await apiService.createShift({
        'name': _nameController.text.trim(),
        'startTime': _startTimeController.text.trim(),
        'endTime': _endTimeController.text.trim(),
        'days': _selectedDays.toList(),
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Shift created successfully'),
            backgroundColor: DiklyColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create shift: ${e.toString()}'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomPadding),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Create New Shift',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Shift Name',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: DiklyColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                hintText: 'e.g. Morning Shift',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Please enter a shift name';
                return null;
              },
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Start Time',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _startTimeController,
                        readOnly: true,
                        onTap: () => _pickTime(_startTimeController),
                        decoration: const InputDecoration(
                          hintText: '08:00',
                          border: OutlineInputBorder(),
                          suffixIcon: Icon(Icons.access_time, size: 18),
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return 'Required';
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'End Time',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _endTimeController,
                        readOnly: true,
                        onTap: () => _pickTime(_endTimeController),
                        decoration: const InputDecoration(
                          hintText: '17:00',
                          border: OutlineInputBorder(),
                          suffixIcon: Icon(Icons.access_time, size: 18),
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return 'Required';
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Working Days',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: DiklyColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _allDays.map((day) {
                final isSelected = _selectedDays.contains(day);
                return FilterChip(
                  label: Text(day.substring(0, 3)),
                  selected: isSelected,
                  onSelected: (selected) {
                    setState(() {
                      if (selected) {
                        _selectedDays.add(day);
                      } else {
                        _selectedDays.remove(day);
                      }
                    });
                  },
                  selectedColor: const Color(0xFF0369A1).withOpacity(0.15),
                  checkmarkColor: const Color(0xFF0369A1),
                  labelStyle: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? const Color(0xFF0369A1) : DiklyColors.textSecondary,
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0369A1),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text(
                        'Create Shift',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
