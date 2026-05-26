import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class LecturerScheduleScreen extends StatefulWidget {
  const LecturerScheduleScreen({super.key});

  @override
  State<LecturerScheduleScreen> createState() => _LecturerScheduleScreenState();
}

class _LecturerScheduleScreenState extends State<LecturerScheduleScreen> {
  List<Map<String, dynamic>> _timetable = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTimetable();
  }

  Future<void> _loadTimetable() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final slots = await apiService.getTimetable();
      setState(() {
        _timetable = slots;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _showComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Coming soon')),
    );
  }

  /// Groups timetable slots by day field.
  Map<String, List<Map<String, dynamic>>> get _grouped {
    final map = <String, List<Map<String, dynamic>>>{};
    for (final slot in _timetable) {
      final day = slot['day']?.toString() ?? slot['dayOfWeek']?.toString() ?? 'Unknown';
      map.putIfAbsent(day, () => []).add(slot);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
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
              'My Schedule',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            Text(
              'Your weekly class timetable — tap any slot to edit',
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
              onPressed: _showComingSoon,
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
                'Add Class',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadTimetable,
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
                            onPressed: _loadTimetable,
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  )
                : _timetable.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          const SizedBox(height: 40),
                          Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 80,
                                  height: 80,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEFF6FF),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: const Icon(
                                    Icons.calendar_month_outlined,
                                    size: 40,
                                    color: Color(0xFF2563EB),
                                  ),
                                ),
                                const SizedBox(height: 24),
                                const Text(
                                  'No classes scheduled yet',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    color: DiklyColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'Add your first class to build out your weekly timetable',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: DiklyColors.textSecondary,
                                    height: 1.5,
                                  ),
                                ),
                                const SizedBox(height: 28),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: _showComingSoon,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor:
                                          const Color(0xFF2563EB),
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 14),
                                      shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(10)),
                                      elevation: 0,
                                    ),
                                    icon: const Icon(Icons.add, size: 18),
                                    label: const Text(
                                      '+ Add Your First Class',
                                      style: TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      )
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: _grouped.entries.map((entry) {
                          return _DaySection(
                            day: entry.key,
                            slots: entry.value,
                            onTapSlot: _showComingSoon,
                          );
                        }).toList(),
                      ),
      ),
    );
  }
}

class _DaySection extends StatelessWidget {
  final String day;
  final List<Map<String, dynamic>> slots;
  final VoidCallback onTapSlot;

  const _DaySection({
    required this.day,
    required this.slots,
    required this.onTapSlot,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8, top: 4),
          child: Text(
            day.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textSecondary,
              letterSpacing: 1.2,
            ),
          ),
        ),
        ...slots.map((slot) => _SlotCard(slot: slot, onTap: onTapSlot)),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _SlotCard extends StatelessWidget {
  final Map<String, dynamic> slot;
  final VoidCallback onTap;

  const _SlotCard({required this.slot, required this.onTap});

  String get _subject =>
      slot['subject']?.toString() ??
      slot['course']?.toString() ??
      slot['title']?.toString() ??
      'Class';

  String get _timeRange {
    final start = slot['startTime']?.toString() ?? slot['start']?.toString();
    final end = slot['endTime']?.toString() ?? slot['end']?.toString();
    if (start != null && end != null) return '$start – $end';
    if (start != null) return start;
    return '';
  }

  String get _room =>
      slot['room']?.toString() ?? slot['venue']?.toString() ?? '';

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: DiklyColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFF2563EB),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _subject,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: DiklyColors.textPrimary,
                    ),
                  ),
                  if (_timeRange.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(Icons.access_time_rounded,
                            size: 12, color: DiklyColors.textSecondary),
                        const SizedBox(width: 4),
                        Text(
                          _timeRange,
                          style: const TextStyle(
                              fontSize: 12,
                              color: DiklyColors.textSecondary),
                        ),
                        if (_room.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          const Icon(Icons.room_outlined,
                              size: 12, color: DiklyColors.textSecondary),
                          const SizedBox(width: 2),
                          Text(
                            _room,
                            style: const TextStyle(
                                fontSize: 12,
                                color: DiklyColors.textSecondary),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                size: 18, color: DiklyColors.textSecondary),
          ],
        ),
      ),
    );
  }
}
