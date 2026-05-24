import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../providers/meetings_provider.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';

class StudentMeetingsScreen extends ConsumerWidget {
  const StudentMeetingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meetingsAsync = ref.watch(meetingsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(meetingsProvider),
      child: meetingsAsync.when(
        data: (meetings) => meetings.isEmpty
            ? const EmptyState(icon: Icons.video_call_outlined, title: 'No Classes', message: 'No classes are scheduled yet.')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: meetings.length,
                itemBuilder: (_, i) => _MeetingCard(meeting: meetings[i]),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(meetingsProvider)),
      ),
    );
  }
}

class _MeetingCard extends ConsumerWidget {
  final Meeting meeting;
  const _MeetingCard({required this.meeting});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isLive = meeting.status == 'live';
    final color = isLive ? DiklyColors.success : DiklyColors.primary;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(meeting.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                _StatusBadge(status: meeting.status),
              ],
            ),
            if (meeting.hostName != null) ...[
              const SizedBox(height: 6),
              Row(children: [
                const Icon(Icons.person_outline, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(meeting.hostName!, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
              ]),
            ],
            if (meeting.scheduledStart != null) ...[
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.schedule, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(DateFormat('EEE, MMM d · h:mm a').format(meeting.scheduledStart!),
                    style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
              ]),
            ],
            if (isLive) ...[
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _joinMeeting(context, meeting),
                  icon: const Icon(Icons.play_arrow, size: 18),
                  label: const Text('Join Class Now'),
                  style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _joinMeeting(BuildContext context, Meeting meeting) async {
    try {
      final data = await apiService.joinMeeting(meeting.id);
      final url = data['meetingUrl']?.toString();
      if (url != null && await canLaunchUrl(Uri.parse(url))) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      } else {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cannot open meeting room'), backgroundColor: DiklyColors.error));
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
      }
    }
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'live': color = DiklyColors.success; break;
      case 'upcoming': color = DiklyColors.primary; break;
      case 'ended': color = DiklyColors.textSecondary; break;
      default: color = DiklyColors.warning;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.3))),
      child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
    );
  }
}
