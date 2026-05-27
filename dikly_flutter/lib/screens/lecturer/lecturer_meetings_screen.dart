import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../providers/meetings_provider.dart';
import '../../widgets/ds/empty_state.dart';
import '../../widgets/error_view.dart';

class LecturerMeetingsScreen extends ConsumerStatefulWidget {
  const LecturerMeetingsScreen({super.key});

  @override
  ConsumerState<LecturerMeetingsScreen> createState() => _LecturerMeetingsScreenState();
}

class _LecturerMeetingsScreenState extends ConsumerState<LecturerMeetingsScreen> {
  void _showCreateDialog() {
    final titleCtrl = TextEditingController();
    final dateCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Create Meeting', style: TextStyle(fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Meeting Title')),
          const SizedBox(height: 12),
          TextField(controller: dateCtrl, decoration: const InputDecoration(labelText: 'Date & Time (optional)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await apiService.createMeeting({'title': titleCtrl.text.trim(), 'scheduledStart': dateCtrl.text.trim()});
                ref.invalidate(meetingsProvider);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting created!')));
              } catch (e) {
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final meetingsAsync = ref.watch(meetingsProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateDialog,
        backgroundColor: const Color(0xFF7C3AED),
        icon: const Icon(Icons.add),
        label: const Text('New Meeting'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(meetingsProvider),
        child: meetingsAsync.when(
          data: (meetings) => meetings.isEmpty
              ? const DiklyEmptyState(icon: Icons.video_call_outlined, title: 'No Meetings', subtitle: 'Create your first meeting to get started.')
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                  itemCount: meetings.length,
                  itemBuilder: (_, i) => _LecturerMeetingCard(meeting: meetings[i]),
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(meetingsProvider)),
        ),
      ),
    );
  }
}

class _LecturerMeetingCard extends ConsumerWidget {
  final Meeting meeting;
  const _LecturerMeetingCard({required this.meeting});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isLive = meeting.status == 'live';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(meeting.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
              _badge(meeting.status),
            ]),
            if (meeting.scheduledStart != null) ...[
              const SizedBox(height: 6),
              Text(DateFormat('EEE, MMM d · h:mm a').format(meeting.scheduledStart!),
                  style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            ],
            const SizedBox(height: 14),
            Row(children: [
              if (!isLive)
                Expanded(child: OutlinedButton(
                  onPressed: () => _startMeeting(context, ref),
                  style: OutlinedButton.styleFrom(foregroundColor: DiklyColors.success, side: const BorderSide(color: DiklyColors.success)),
                  child: const Text('Start', style: TextStyle(fontSize: 13)),
                ))
              else
                Expanded(child: ElevatedButton(
                  onPressed: () => _openMeeting(context),
                  style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success),
                  child: const Text('Open Class', style: TextStyle(fontSize: 13)),
                )),
              if (isLive) ...[
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(
                  onPressed: () => _endMeeting(context, ref),
                  style: OutlinedButton.styleFrom(foregroundColor: DiklyColors.error, side: const BorderSide(color: DiklyColors.error)),
                  child: const Text('End', style: TextStyle(fontSize: 13)),
                )),
              ],
            ]),
          ],
        ),
      ),
    );
  }

  Widget _badge(String status) {
    Color color;
    switch (status) {
      case 'live': color = DiklyColors.success; break;
      case 'upcoming': color = const Color(0xFF7C3AED); break;
      default: color = DiklyColors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
      child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700)),
    );
  }

  Future<void> _startMeeting(BuildContext context, WidgetRef ref) async {
    try {
      await apiService.startMeeting(meeting.id);
      ref.invalidate(meetingsProvider);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting started!')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
    }
  }

  Future<void> _openMeeting(BuildContext context) async {
    try {
      final data = await apiService.joinMeeting(meeting.id);
      final url = data['meetingUrl']?.toString();
      if (url != null && await canLaunchUrl(Uri.parse(url))) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
    }
  }

  Future<void> _endMeeting(BuildContext context, WidgetRef ref) async {
    try {
      await apiService.endMeeting(meeting.id);
      ref.invalidate(meetingsProvider);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Meeting ended.')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
    }
  }
}
