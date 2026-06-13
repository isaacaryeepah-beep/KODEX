import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _timetableProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getTimetable(),
);

class TimetableScreen extends ConsumerStatefulWidget {
  const TimetableScreen({super.key});

  @override
  ConsumerState<TimetableScreen> createState() => _TimetableScreenState();
}

class _TimetableScreenState extends ConsumerState<TimetableScreen> {
  int _selectedDayIndex = 0;

  static const List<String> _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  static const List<String> _fullDays = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
  ];

  @override
  void initState() {
    super.initState();
    // Default to current day if weekday
    final today = DateTime.now().weekday; // 1=Mon ... 5=Fri
    if (today >= 1 && today <= 5) {
      _selectedDayIndex = today - 1;
    }
  }

  Color _resolveColor(Map<String, dynamic> slot) {
    final colorStr = slot['color']?.toString();
    if (colorStr != null && colorStr.isNotEmpty) {
      final hex = colorStr.replaceFirst('#', '');
      if (hex.length == 6) {
        final val = int.tryParse(hex, radix: 16);
        if (val != null) return Color(0xFF000000 | val);
      }
      if (hex.length == 8) {
        final val = int.tryParse(hex, radix: 16);
        if (val != null) return Color(val);
      }
    }
    // Generate from course code hash
    final code = slot['courseCode']?.toString() ?? slot['courseName']?.toString() ?? '';
    final colors = [
      DiklyColors.primary,
      const Color(0xFF7C3AED),
      const Color(0xFF0D9488),
      const Color(0xFFD97706),
      const Color(0xFFDC2626),
      const Color(0xFF059669),
      const Color(0xFF2563EB),
      const Color(0xFFDB2777),
    ];
    int hash = 0;
    for (final char in code.codeUnits) {
      hash = (hash * 31 + char) & 0xFFFFFFFF;
    }
    return colors[hash.abs() % colors.length];
  }

  List<Map<String, dynamic>> _getSlotsForDay(
      List<Map<String, dynamic>> all, String day) {
    return all
        .where((s) =>
            (s['day']?.toString() ?? '').toLowerCase() == day.toLowerCase())
        .toList()
      ..sort((a, b) {
        final aTime = a['startTime']?.toString() ?? '';
        final bTime = b['startTime']?.toString() ?? '';
        return aTime.compareTo(bTime);
      });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_timetableProvider);
    final user = ref.watch(currentUserProvider);
    final isLecturer = user?.role == 'lecturer';
    final isHod = user?.role == 'hod';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Timetable'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load timetable'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_timetableProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) => Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: DiklyScreenHeader(
                      title: isHod ? 'Department Timetable' : 'My Timetable',
                      subtitle: isHod
                          ? 'Read-only view of all department class slots'
                          : isLecturer
                              ? 'Your weekly class timetable — click any slot to edit'
                              : 'Your weekly class timetable based on enrolled courses',
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Export .ics — coming soon')),
                    ),
                    icon: const Icon(Icons.calendar_today_outlined, size: 14),
                    label: const Text('Export .ics', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      foregroundColor: const Color(0xFF374151),
                    ),
                  ),
                  if (isLecturer) ...[
                    const SizedBox(width: 8),
                    ElevatedButton.icon(
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Add Class — coming soon')),
                      ),
                      icon: const Icon(Icons.add, size: 14),
                      label: const Text('Add Class', style: TextStyle(fontSize: 12)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            _DayTabBar(
              days: _days,
              selectedIndex: _selectedDayIndex,
              onSelected: (i) => setState(() => _selectedDayIndex = i),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async => ref.refresh(_timetableProvider),
                child: _DaySchedule(
                  slots: _getSlotsForDay(data, _fullDays[_selectedDayIndex]),
                  colorResolver: _resolveColor,
                  isLecturer: isLecturer,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayTabBar extends StatelessWidget {
  final List<String> days;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  const _DayTabBar({
    required this.days,
    required this.selectedIndex,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: DiklyColors.surface,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: List.generate(days.length, (i) {
            final selected = i == selectedIndex;
            return GestureDetector(
              onTap: () => onSelected(i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.only(right: 8),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                decoration: BoxDecoration(
                  color: selected
                      ? DiklyColors.primary
                      : DiklyColors.background,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: selected ? DiklyColors.primary : DiklyColors.border,
                    width: 1.5,
                  ),
                ),
                child: Text(
                  days[i],
                  style: TextStyle(
                    color: selected ? Colors.white : DiklyColors.textSecondary,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _DaySchedule extends StatelessWidget {
  final List<Map<String, dynamic>> slots;
  final Color Function(Map<String, dynamic>) colorResolver;
  final bool isLecturer;

  const _DaySchedule({required this.slots, required this.colorResolver, this.isLecturer = false});

  @override
  Widget build(BuildContext context) {
    if (slots.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.calendar_today_outlined, size: 48, color: Color(0xFF9CA3AF)),
                SizedBox(height: 16),
                Text(
                  'No classes scheduled yet',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: 8),
                Text(
                  isLecturer
                      ? 'Add your first class to build out your weekly timetable'
                      : "Your lecturers haven't added timetable slots yet. Check back soon.",
                  style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: slots.length,
      itemBuilder: (context, index) {
        return _SlotCard(
          slot: slots[index],
          accentColor: colorResolver(slots[index]),
        );
      },
    );
  }
}

class _SlotCard extends StatelessWidget {
  final Map<String, dynamic> slot;
  final Color accentColor;

  const _SlotCard({required this.slot, required this.accentColor});

  @override
  Widget build(BuildContext context) {
    final startTime = slot['startTime']?.toString() ?? '';
    final endTime = slot['endTime']?.toString() ?? '';
    final courseName = slot['courseName']?.toString() ?? 'Unknown Course';
    final courseCode = slot['courseCode']?.toString() ?? '';
    final lecturer = slot['lecturer']?.toString() ?? '';
    final room = slot['room']?.toString() ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Container(
              width: 5,
              decoration: BoxDecoration(
                color: accentColor,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  bottomLeft: Radius.circular(12),
                ),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            courseName,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                        if (courseCode.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: accentColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                  color: accentColor.withOpacity(0.3)),
                            ),
                            child: Text(
                              courseCode,
                              style: TextStyle(
                                color: accentColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(Icons.access_time_outlined,
                            size: 14, color: DiklyColors.textSecondary),
                        const SizedBox(width: 4),
                        Text(
                          '$startTime - $endTime',
                          style: const TextStyle(
                            color: DiklyColors.textSecondary,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                    if (room.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.location_on_outlined,
                              size: 14, color: DiklyColors.textSecondary),
                          const SizedBox(width: 4),
                          Text(
                            room,
                            style: const TextStyle(
                              color: DiklyColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (lecturer.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.person_outline_rounded,
                              size: 14, color: DiklyColors.textSecondary),
                          const SizedBox(width: 4),
                          Text(
                            lecturer,
                            style: const TextStyle(
                              color: DiklyColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
