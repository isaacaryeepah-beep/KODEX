import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../providers/meetings_provider.dart';
import '../../widgets/ds/dikly_ds.dart';
import '../../widgets/error_view.dart';

class StudentMeetingsScreen extends ConsumerWidget {
  const StudentMeetingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meetingsAsync = ref.watch(meetingsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(meetingsProvider),
      child: meetingsAsync.when(
        data: (meetings) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Header ────────────────────────────────────────────────
            const DiklyScreenHeader(
              title: 'Meetings',
              subtitle: 'Your scheduled and live classes',
            ),

            // ── List or empty state ───────────────────────────────────
            if (meetings.isEmpty)
              const DiklyEmptyState(
                icon: Icons.video_call_outlined,
                title: 'No Classes Scheduled',
                subtitle: 'Your upcoming classes will appear here.',
              )
            else
              ...meetings.map((m) => _MeetingCard(meeting: m)),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(meetingsProvider),
        ),
      ),
    );
  }
}

// ── Meeting Card ────────────────────────────────────────────────────────────

class _MeetingCard extends ConsumerWidget {
  final Meeting meeting;
  const _MeetingCard({required this.meeting});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isLive = meeting.status == 'live';

    Color statusColor;
    switch (meeting.status) {
      case 'live':
        statusColor = DiklyColors.success;
        break;
      case 'upcoming':
        statusColor = DiklyColors.primary;
        break;
      case 'ended':
        statusColor = DiklyColors.textLight;
        break;
      default:
        statusColor = DiklyColors.warning;
    }

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      borderRadius: 10,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title + status
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: isLive ? DiklyColors.successLight : DiklyColors.primaryULight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.video_call_outlined,
                  color: isLive ? DiklyColors.success : DiklyColors.primary,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      meeting.title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: DiklyColors.text,
                      ),
                    ),
                    if (meeting.createdBy != null) ...[
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          const Icon(Icons.person_outline,
                              size: 13, color: DiklyColors.textLight),
                          const SizedBox(width: 4),
                          Text(
                            meeting.createdBy!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: DiklyColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              DiklyBadge(
                label: meeting.status.toUpperCase(),
                color: statusColor,
              ),
            ],
          ),

          if (meeting.scheduledStart != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.schedule, size: 14, color: DiklyColors.textLight),
                const SizedBox(width: 5),
                Text(
                  DateFormat('EEE, MMM d · h:mm a').format(meeting.scheduledStart!),
                  style: const TextStyle(
                    fontSize: 13,
                    color: DiklyColors.textSecondary,
                  ),
                ),
              ],
            ),
          ],

          // Join button (shown for live meetings)
          if (isLive) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _joinMeeting(context, meeting),
                icon: const Icon(Icons.play_arrow, size: 18),
                label: const Text('Join Class Now'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.success,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ],
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
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Cannot open meeting room'),
              backgroundColor: DiklyColors.error,
            ),
          );
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    }
  }
}
