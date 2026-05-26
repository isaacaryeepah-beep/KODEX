import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../providers/meetings_provider.dart';
import '../../providers/announcements_provider.dart';
import '../../widgets/stat_card.dart';
import '../../widgets/error_view.dart';
import '../../models/meeting.dart';
import '../../models/announcement.dart';

class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final meetingsAsync = ref.watch(upcomingMeetingsProvider);
    final announcementsAsync = ref.watch(announcementsProvider);

    final firstName = (user?.name ?? 'Student').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(upcomingMeetingsProvider);
        ref.invalidate(announcementsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Plain welcome section
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back, $firstName',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      "Here's an overview of your workspace at $institution",
                      style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ),
                  if (deptBadge.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        deptBadge,
                        style: const TextStyle(
                          color: Color(0xFFD97706),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text('Overview', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary)),
          const SizedBox(height: 12),
          meetingsAsync.when(
            data: (meetings) => _StatsRow(meetingCount: meetings.length),
            loading: () => const _StatsRow(meetingCount: 0),
            error: (_, __) => const _StatsRow(meetingCount: 0),
          ),
          const SizedBox(height: 24),
          const Text('Upcoming Classes', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          meetingsAsync.when(
            data: (meetings) => meetings.isEmpty
                ? _emptyCard('No upcoming classes scheduled')
                : Column(children: meetings.take(5).map((m) => _MeetingTile(meeting: m)).toList()),
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
            error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(upcomingMeetingsProvider)),
          ),
          const SizedBox(height: 24),
          const Text('Announcements', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          announcementsAsync.when(
            data: (list) => list.isEmpty
                ? _emptyCard('No announcements yet')
                : Column(children: list.take(5).map((a) => _AnnouncementTile(a: a)).toList()),
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
            error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(announcementsProvider)),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _emptyCard(String msg) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(color: DiklyColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: DiklyColors.border)),
    child: Text(msg, style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 13)),
  );
}

class _StatsRow extends StatelessWidget {
  final int meetingCount;
  const _StatsRow({required this.meetingCount});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: StatCard(title: 'Classes Today', value: meetingCount.toString(), icon: Icons.video_call_outlined, color: DiklyColors.primary)),
        const SizedBox(width: 12),
        const Expanded(child: StatCard(title: 'Pending Tasks', value: '—', icon: Icons.assignment_outlined, color: Color(0xFF7C3AED))),
      ],
    );
  }
}

class _MeetingTile extends StatelessWidget {
  final Meeting meeting;
  const _MeetingTile({required this.meeting});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.video_call_outlined, color: DiklyColors.primary, size: 20),
        ),
        title: Text(meeting.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(meeting.scheduledStart != null ? DateFormat('MMM d, h:mm a').format(meeting.scheduledStart!) : 'Scheduled',
            style: const TextStyle(fontSize: 12)),
        trailing: _StatusChip(status: meeting.status),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'live': color = DiklyColors.success; break;
      case 'upcoming': color = DiklyColors.primary; break;
      default: color = DiklyColors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
      child: Text(status, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

class _AnnouncementTile extends StatelessWidget {
  final Announcement a;
  const _AnnouncementTile({required this.a});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            if (a.content.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(a.content, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary, height: 1.4), maxLines: 3, overflow: TextOverflow.ellipsis),
            ],
          ],
        ),
      ),
    );
  }
}
