import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class LecturerScheduleScreen extends StatefulWidget {
  const LecturerScheduleScreen({super.key});

  @override
  State<LecturerScheduleScreen> createState() =>
      _LecturerScheduleScreenState();
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

  Map<String, List<Map<String, dynamic>>> get _grouped {
    final map = <String, List<Map<String, dynamic>>>{};
    for (final slot in _timetable) {
      final day = slot['day']?.toString() ??
          slot['dayOfWeek']?.toString() ??
          'Unknown';
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
        surfaceTintColor: Colors.transparent,
        leading:
            BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: const Text(
          'My Schedule',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Color(0xFF111827),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _loadTimetable,
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
                        'My Schedule',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF111827),
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Your weekly class timetable — click any slot to edit',
                        style: TextStyle(
                            fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: _showComingSoon,
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
                    '+ Add Class',
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
            else if (_error != null)
              Center(
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
                            color: Color(0xFF6B7280)),
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
            else if (_timetable.isEmpty)
              Container(
                padding: const EdgeInsets.all(40),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF6FF),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(
                          Icons.calendar_month_outlined,
                          size: 32,
                          color: Color(0xFF2563EB),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'No classes scheduled yet',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF111827),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Add your first class to build out your weekly timetable',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: 220,
                        height: 48,
                        child: ElevatedButton(
                          onPressed: _showComingSoon,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(10)),
                            elevation: 0,
                          ),
                          child: const Text(
                            '+ Add Your First Class',
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              ..._grouped.entries.map((entry) => _DaySection(
                    day: entry.key,
                    slots: entry.value,
                    onTapSlot: _showComingSoon,
                  )),
          ],
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
              color: Color(0xFF9CA3AF),
              letterSpacing: 1.5,
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
    final start =
        slot['startTime']?.toString() ?? slot['start']?.toString();
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
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
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
                      color: Color(0xFF111827),
                    ),
                  ),
                  if (_timeRange.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(Icons.access_time_rounded,
                            size: 12, color: Color(0xFF6B7280)),
                        const SizedBox(width: 4),
                        Text(
                          _timeRange,
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFF6B7280)),
                        ),
                        if (_room.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          const Icon(Icons.room_outlined,
                              size: 12, color: Color(0xFF6B7280)),
                          const SizedBox(width: 2),
                          Text(
                            _room,
                            style: const TextStyle(
                                fontSize: 12, color: Color(0xFF6B7280)),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                size: 18, color: Color(0xFF9CA3AF)),
          ],
        ),
      ),
    );
  }
}
