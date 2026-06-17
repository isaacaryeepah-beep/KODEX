import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _myShiftProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getMyShift());

class EmployeeShiftScreen extends ConsumerWidget {
  const EmployeeShiftScreen({super.key});

  static const _accent = Color(0xFF0369A1);
  static const _allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  bool _isDayActive(List<dynamic> days, String day) {
    return days.any((d) {
      final str = d.toString().toLowerCase();
      return str.startsWith(day.toLowerCase()) || str == day.toLowerCase();
    });
  }

  List<bool> _getWeekSchedule(List<dynamic> days) {
    final now = DateTime.now();
    // Build 7-column for this week starting Monday
    final monday = now.subtract(Duration(days: now.weekday - 1));
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
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(_myShiftProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(title: 'My Shift', subtitle: 'Your assigned working hours'),
              DiklyErrorView(message: 'Failed to load shift', onRetry: () => ref.refresh(_myShiftProvider)),
            ],
          ),
          data: (shift) {
            // Empty / no shift assigned
            if (shift.isEmpty || (shift['shiftName'] == null && shift['name'] == null)) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  DiklyScreenHeader(title: 'My Shift', subtitle: 'Your assigned working hours'),
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Column(
                      children: [
                        Icon(Icons.calendar_today_outlined, size: 48, color: DiklyColors.border),
                        const SizedBox(height: 12),
                        Text('No shift assigned',
                            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w600, color: DiklyColors.text)),
                        const SizedBox(height: 6),
                        Text('Contact your manager to get a shift assigned to you.',
                            style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                            textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                ],
              );
            }

            final name = shift['shiftName']?.toString() ?? shift['name']?.toString() ?? 'Shift';
            final startTime = shift['startTime']?.toString() ?? '--:--';
            final endTime = shift['endTime']?.toString() ?? '--:--';
            final days = shift['days'] as List? ?? [];
            final location = shift['location']?.toString();
            final weekSchedule = _getWeekSchedule(days);

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                DiklyScreenHeader(title: 'My Shift', subtitle: 'Your assigned working hours'),

                // ── Shift detail card ───────────────────────────────────
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Icon(Icons.access_time_outlined, size: 15, color: DiklyColors.textMuted),
                          const SizedBox(width: 6),
                          Text('$startTime → $endTime',
                              style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text)),
                        ],
                      ),
                      if (location != null && location.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.location_on_outlined, size: 15, color: DiklyColors.textMuted),
                            const SizedBox(width: 6),
                            Text(location,
                                style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textSecondary)),
                          ],
                        ),
                      ],
                      if (days.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 12),
                        Text('Working Days',
                            style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.textMuted)),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: _allDays.map((day) {
                            final isActive = _isDayActive(days, day);
                            return Column(
                              children: [
                                Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: isActive ? _accent : DiklyColors.background,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: isActive ? _accent : DiklyColors.border),
                                  ),
                                  child: Center(
                                    child: Text(day[0],
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: isActive ? Colors.white : DiklyColors.textMuted,
                                        )),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(day,
                                    style: GoogleFonts.dmSans(fontSize: 9, color: isActive ? _accent : DiklyColors.textMuted)),
                              ],
                            );
                          }).toList(),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // ── This Week ───────────────────────────────────────────
                Text('This Week',
                    style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
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
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white60,
            fontSize: 11,
            letterSpacing: 1,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            time,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
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
  static const _accent = Color(0xFF0369A1);

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final todayIndex = now.weekday - 1; // 0=Mon

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: DiklyColors.border),
      ),
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
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: isScheduled
                            ? (isToday ? _accent : _accent.withOpacity(0.15))
                            : (isToday ? DiklyColors.background : Colors.transparent),
                        shape: BoxShape.circle,
                        border: isToday
                            ? Border.all(color: _accent, width: 2)
                            : null,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            day.day.toString(),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: isScheduled
                                  ? (isToday ? Colors.white : _accent)
                                  : (isToday ? _accent : DiklyColors.textSecondary),
                            ),
                          ),
                        ],
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
                decoration: const BoxDecoration(
                  color: _accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              const Text(
                'Scheduled',
                style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
              ),
              const SizedBox(width: 16),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: DiklyColors.border,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              const Text(
                'Off',
                style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
