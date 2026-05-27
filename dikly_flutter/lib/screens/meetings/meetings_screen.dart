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

class MeetingsScreen extends ConsumerStatefulWidget {
  const MeetingsScreen({super.key});

  @override
  ConsumerState<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends ConsumerState<MeetingsScreen> {
  List<Meeting> _meetings = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final meetings = await apiService.getMeetings();
      setState(() { _meetings = meetings; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
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
              subtitle: '${_meetings.length} meeting${_meetings.length == 1 ? '' : 's'}',
              action: canCreate
                  ? ElevatedButton.icon(
                      onPressed: () => context.push('/sessions/create'),
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Create Meeting'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                        elevation: 0,
                      ),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                          const SizedBox(height: 12),
                          Text(_error!),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                        ],
                      ))
                    : _meetings.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.groups_outlined,
                            title: 'No meetings scheduled',
                            subtitle: 'Meetings will appear here',
                            buttonLabel: canCreate ? 'Create Meeting' : null,
                            onButton: canCreate ? () => context.push('/sessions/create') : null,
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
                                      'Upcoming & Live',
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.textSecondary),
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
                                      'Past Meetings',
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.textSecondary),
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

  Future<void> _joinMeeting(Meeting meeting) async {
    try {
      final info = await apiService.joinMeeting(meeting.id);
      final url = info['meetingUrl']?.toString() ?? '';
      if (url.isNotEmpty && mounted) {
        context.push('/video-player', extra: {'url': url, 'title': meeting.title});
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not join: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
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
    final dateStr = meeting.scheduledStart != null
        ? DateFormat('EEE, MMM d · h:mm a').format(meeting.scheduledStart!)
        : '';

    // Duration in minutes
    String durationStr = '';
    if (meeting.scheduledStart != null && meeting.scheduledEnd != null) {
      final mins = meeting.scheduledEnd!.difference(meeting.scheduledStart!).inMinutes;
      durationStr = '$mins min';
    }

    return Opacity(
      opacity: isPast ? 0.7 : 1.0,
      child: DiklyCard(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        meeting.title,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: isPast ? DiklyColors.textSecondary : DiklyColors.text,
                        ),
                      ),
                      if (meeting.createdBy != null) ...[
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            const Icon(Icons.person_outline_rounded, size: 13, color: DiklyColors.textLight),
                            const SizedBox(width: 4),
                            Text(
                              meeting.createdBy!,
                              style: const TextStyle(fontSize: 12, color: DiklyColors.textLight),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                // Status badge
                if (isPast)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: DiklyColors.grey100,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'Ended',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textLight),
                    ),
                  )
                else if (meeting.isLive)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: DiklyColors.successLight,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(width: 6, height: 6, decoration: const BoxDecoration(color: DiklyColors.success, shape: BoxShape.circle)),
                        const SizedBox(width: 5),
                        const Text('Live', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.success)),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            // Date/time + duration chips
            Row(
              children: [
                if (dateStr.isNotEmpty) ...[
                  DiklyInfoChip(
                    icon: Icons.calendar_today_outlined,
                    label: dateStr,
                  ),
                  const SizedBox(width: 8),
                ],
                if (durationStr.isNotEmpty)
                  DiklyInfoChip(
                    icon: Icons.timer_outlined,
                    label: durationStr,
                  ),
                const Spacer(),
                // Join button for live meetings
                if (!isPast && onJoin != null)
                  ElevatedButton.icon(
                    onPressed: onJoin,
                    icon: const Icon(Icons.video_call_rounded, size: 16),
                    label: const Text('Join'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: DiklyColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                      textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
