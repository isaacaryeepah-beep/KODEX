import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/meeting_card.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

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

    return AppShell(
      title: 'Meetings',
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/sessions/create'),
              icon: const Icon(Icons.add),
              label: const Text('Schedule Meeting'),
            )
          : null,
      child: _loading
          ? const LoadingList()
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
                  ? EmptyState(
                      icon: Icons.groups_outlined,
                      title: 'No meetings scheduled',
                      subtitle: 'Meetings will appear here',
                      actionLabel: canCreate ? 'Schedule Meeting' : null,
                      onAction: canCreate ? () => context.push('/sessions/create') : null,
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _meetings.length,
                        itemBuilder: (context, index) {
                          final meeting = _meetings[index];
                          return MeetingCard(
                            meeting: meeting,
                            onTap: () => context.push('/sessions/${meeting.id}'),
                            onJoin: meeting.isLive ? () => _joinMeeting(meeting) : null,
                          );
                        },
                      ),
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
