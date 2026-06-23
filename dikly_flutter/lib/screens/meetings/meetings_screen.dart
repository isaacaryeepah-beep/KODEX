import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/ds/dikly_ds.dart';
import 'meeting_room_screen.dart';

class MeetingsScreen extends ConsumerStatefulWidget {
  const MeetingsScreen({super.key});

  @override
  ConsumerState<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends ConsumerState<MeetingsScreen> {
  List<Meeting> _meetings = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  String _fmt(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final ampm = dt.hour < 12 ? 'AM' : 'PM';
    return '$h:$m $ampm';
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; });
    try {
      final meetings = await apiService.getMeetings();
      setState(() { _meetings = meetings; _loading = false; });
    } catch (_) {
      setState(() { _meetings = []; _loading = false; });
    }
  }

  Future<void> _startNow() async {
    final titleCtrl = TextEditingController(text: 'Instant Meeting');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Start Meeting Now', style: TextStyle(fontWeight: FontWeight.w700)),
        content: TextField(
          controller: titleCtrl,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Meeting title'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
            child: const Text('Start'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      final now = DateTime.now();
      final created = await apiService.createMeeting({
        'title': titleCtrl.text.trim().isEmpty ? 'Instant Meeting' : titleCtrl.text.trim(),
        'scheduledStart': now.toIso8601String(),
        'scheduledEnd': now.add(const Duration(hours: 1)).toIso8601String(),
      });
      await apiService.startMeeting(created.id);
      if (!mounted) return;
      final token = ref.read(authProvider).token ?? '';
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MeetingRoomScreen(
          meetingId: created.id,
          title: created.title,
          token: token,
        ),
      ));
      _loadData();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not start meeting: $e'), backgroundColor: const Color(0xFFEF4444)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canCreate = user?.role == 'lecturer' || user?.role == 'admin' || user?.role == 'hod' || user?.role == 'manager';

    final upcomingOrLive = _meetings.where((m) => !m.isEnded).toList();
    final past = _meetings.where((m) => m.isEnded).toList();

    return AppShell(
      title: 'Meetings',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Meetings',
              subtitle: 'Secure video meetings',
              action: canCreate
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ElevatedButton.icon(
                          onPressed: () => context.push('/sessions/create'),
                          icon: const Icon(Icons.calendar_today_rounded, size: 14),
                          label: const Text('Schedule'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF7C3AED),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                            elevation: 0,
                          ),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton.icon(
                          onPressed: _startNow,
                          icon: const Icon(Icons.play_arrow_rounded, size: 16),
                          label: const Text('Start Now'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF16A34A),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                            elevation: 0,
                          ),
                        ),
                      ],
                    )
                  : null,
            ),
          ),
          // Device lock banner
          if (user != null && user.deviceLocked) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFFCD34D)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('🔒 ', style: TextStyle(fontSize: 14)),
                    Expanded(
                      child: Text(
                        user.deviceLockedUntil != null
                            ? 'Device Lock Active — Joining meetings is blocked until ${_fmt(user.deviceLockedUntil!)}. Contact your admin or HOD to unlock early.'
                            : 'Device Lock Active — Joining meetings is currently blocked. Contact your admin or HOD to unlock.',
                        style: const TextStyle(fontSize: 13, color: Color(0xFF92400E), height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _meetings.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.all(16),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: DiklyColors.border),
                              ),
                              child: const Center(
                                child: Text(
                                  'No meetings scheduled yet.',
                                  style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView(
                              padding: const EdgeInsets.all(16),
                              children: [
                                if (upcomingOrLive.isNotEmpty) ...[
                                  const Padding(
                                    padding: EdgeInsets.only(bottom: 10),
                                    child: Text(
                                      'UPCOMING & LIVE',
                                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textSecondary, letterSpacing: 0.5),
                                    ),
                                  ),
                                  ...upcomingOrLive.map((m) => _MeetingCard(
                                    meeting: m,
                                    onTap: () => context.push('/sessions/${m.id}'),
                                    onJoin: m.isLive ? () => _joinMeeting(m) : null,
                                  )),
                                ],
                                if (past.isNotEmpty) ...[
                                  Padding(
                                    padding: EdgeInsets.only(top: upcomingOrLive.isNotEmpty ? 8 : 0, bottom: 10),
                                    child: const Text(
                                      'PAST MEETINGS',
                                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textSecondary, letterSpacing: 0.5),
                                    ),
                                  ),
                                  ...past.map((m) => _MeetingCard(
                                    meeting: m,
                                    onTap: () => context.push('/sessions/${m.id}'),
                                    isPast: true,
                                  )),
                                ],
                              ],
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  void _joinMeeting(Meeting meeting) {
    final token = ref.read(authProvider).token ?? '';
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => MeetingRoomScreen(
        meetingId: meeting.id,
        title: meeting.title,
        token: token,
      ),
    ));
  }
}

class _MeetingCard extends StatelessWidget {
  final Meeting meeting;
  final VoidCallback onTap;
  final VoidCallback? onJoin;
  final bool isPast;

  const _MeetingCard({
    required this.meeting,
    required this.onTap,
    this.onJoin,
    this.isPast = false,
  });

  @override
  Widget build(BuildContext context) {
    final startStr = meeting.scheduledStart != null
        ? DateFormat('EEE, MMM d - h:mm a').format(meeting.scheduledStart!)
        : '—';

    String durationStr = '—';
    if (meeting.scheduledStart != null && meeting.scheduledEnd != null) {
      final mins = meeting.scheduledEnd!.difference(meeting.scheduledStart!).inMinutes;
      durationStr = '$mins min';
    }

    final host = meeting.createdBy ?? '—';
    final meetingType = meeting.meetingType.isEmpty ? 'Lecture' : meeting.meetingType;

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title row
          Row(
            children: [
              Expanded(
                child: Text(
                  meeting.title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                ),
              ),
              const SizedBox(width: 8),
              if (isPast)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFF3F4F6), borderRadius: BorderRadius.circular(20)),
                  child: const Text('Ended', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                )
              else if (meeting.isLive)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(20)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 6, height: 6, decoration: const BoxDecoration(color: Color(0xFF16A34A), shape: BoxShape.circle)),
                      const SizedBox(width: 4),
                      const Text('Live', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF16A34A))),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          // Type tag
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFFD1D5DB)),
              borderRadius: BorderRadius.circular(5),
            ),
            child: Text(
              meetingType.toUpperCase(),
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF6B7280), letterSpacing: 0.4),
            ),
          ),
          const SizedBox(height: 12),
          // Info grid
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Host', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF))),
                    const SizedBox(height: 2),
                    Text(host, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Duration', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF))),
                    const SizedBox(height: 2),
                    Text(durationStr, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Start', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF))),
              const SizedBox(height: 2),
              Text(startStr, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
            ],
          ),
          const SizedBox(height: 14),
          // Action buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onTap,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF374151),
                    side: const BorderSide(color: Color(0xFFD1D5DB)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text('Details', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: onJoin ?? onTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF7C3AED),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    elevation: 0,
                  ),
                  child: const Text('Attendance', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
