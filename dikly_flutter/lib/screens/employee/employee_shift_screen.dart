import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _myShiftProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getMyShift());

class EmployeeShiftScreen extends ConsumerWidget {
  const EmployeeShiftScreen({super.key});

  static const _accent = Color(0xFF16A34A);
  static const _allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  bool _isDayActive(List<dynamic> days, String day) {
    return days.any((d) {
      final str = d.toString().toLowerCase();
      return str.startsWith(day.toLowerCase()) || str == day.toLowerCase();
    });
  }

  List<bool> _getWeekSchedule(List<dynamic> days) {
    return List.generate(7, (i) {
      final dayName = _allDays[i];
      return _isDayActive(days, dayName);
    });
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_myShiftProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('My Shift'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(_myShiftProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                const SizedBox(height: 12),
                const Text('Failed to load shift'),
                TextButton(
                  onPressed: () => ref.refresh(_myShiftProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (shift) {
            final name = shift['shiftName']?.toString() ?? 'Unnamed Shift';
            final startTime = shift['startTime']?.toString() ?? '--:--';
            final endTime = shift['endTime']?.toString() ?? '--:--';
            final days = shift['days'] as List? ?? [];
            final location = shift['location']?.toString();
            final weekSchedule = _getWeekSchedule(days);

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                DiklyScreenHeader(
                  title: 'My Shift',
                  subtitle: 'Your current shift schedule',
                ),

                // Shift card: name, start, end, location
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: _accent.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.schedule, color: _accent, size: 20),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              name,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                                color: DiklyColors.textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          _TimeBlock(label: 'START', time: startTime),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Icon(Icons.arrow_forward, color: DiklyColors.textSecondary, size: 18),
                          ),
                          _TimeBlock(label: 'END', time: endTime),
                          const Spacer(),
                          if (location != null && location.isNotEmpty)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.location_on_outlined, color: DiklyColors.textSecondary, size: 16),
                                const SizedBox(width: 4),
                                Text(
                                  location,
                                  style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Day dots schedule
                const Text(
                  'Scheduled Days',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
                const SizedBox(height: 10),
                DiklyCard(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: _allDays.map((day) {
                      final isActive = _isDayActive(days, day);
                      return Column(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: isActive ? _accent : DiklyColors.background,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: isActive ? _accent : DiklyColors.border,
                                width: 1.5,
                              ),
                            ),
                            child: Center(
                              child: Text(
                                day.substring(0, 1),
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: isActive ? Colors.white : DiklyColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            day,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: isActive ? _accent : DiklyColors.textSecondary,
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 16),

                // This week table/list
                const Text(
                  'This Week',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
                const SizedBox(height: 10),
                _WeekView(weekSchedule: weekSchedule),
                const SizedBox(height: 32),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _TimeBlock extends StatelessWidget {
  final String label;
  final String time;
  const _TimeBlock({required this.label, required this.time});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: DiklyColors.textSecondary,
            fontSize: 10,
            letterSpacing: 1,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: DiklyColors.background,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Text(
            time,
            style: const TextStyle(
              color: DiklyColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _WeekView extends StatelessWidget {
  final List<bool> weekSchedule;
  const _WeekView({required this.weekSchedule});

  static const _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static const _accent = Color(0xFF16A34A);

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final todayIndex = now.weekday - 1; // 0=Mon

    return DiklyCard(
      child: Column(
        children: [
          Row(
            children: List.generate(7, (i) {
              final monday = now.subtract(Duration(days: now.weekday - 1));
              final day = monday.add(Duration(days: i));
              final isToday = i == todayIndex;
              final isScheduled = weekSchedule[i];

              return Expanded(
                child: Column(
                  children: [
                    Text(
                      _days[i].substring(0, 1),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: isToday ? _accent : DiklyColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: isScheduled
                            ? (isToday ? _accent : _accent.withOpacity(0.15))
                            : (isToday ? DiklyColors.background : Colors.transparent),
                        shape: BoxShape.circle,
                        border: isToday ? Border.all(color: _accent, width: 2) : null,
                      ),
                      child: Center(
                        child: Text(
                          day.day.toString(),
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: isScheduled
                                ? (isToday ? Colors.white : _accent)
                                : (isToday ? _accent : DiklyColors.textSecondary),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isScheduled ? _accent : Colors.transparent,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(color: _accent, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              const Text('Scheduled', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
              const SizedBox(width: 16),
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(color: DiklyColors.border, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              const Text('Off', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
