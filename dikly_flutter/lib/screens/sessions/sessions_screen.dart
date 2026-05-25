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

class SessionsScreen extends ConsumerStatefulWidget {
  const SessionsScreen({super.key});

  @override
  ConsumerState<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends ConsumerState<SessionsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Meeting> _allMeetings = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final meetings = await apiService.getMeetings();
      setState(() { _allMeetings = meetings; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<Meeting> get _liveMeetings => _allMeetings.where((m) => m.isLive).toList();
  List<Meeting> get _upcomingMeetings => _allMeetings.where((m) => m.isScheduled).toList();
  List<Meeting> get _pastMeetings => _allMeetings.where((m) => m.isEnded).toList();

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canCreate = user?.role == 'lecturer' || user?.role == 'admin' || user?.role == 'hod' || user?.role == 'manager';

    return AppShell(
      title: 'Sessions',
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              onPressed: () => context.push('/sessions/create'),
              icon: const Icon(Icons.add),
              label: const Text('New Session'),
            )
          : null,
      child: Column(
        children: [
          Container(
            color: DiklyColors.surface,
            child: TabBar(
              controller: _tabController,
              tabs: [
                Tab(text: 'Live (${_liveMeetings.length})'),
                Tab(text: 'Upcoming (${_upcomingMeetings.length})'),
                Tab(text: 'Past'),
              ],
              labelColor: DiklyColors.primary,
              unselectedLabelColor: DiklyColors.textSecondary,
              indicatorColor: DiklyColors.primary,
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
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
                    : TabBarView(
                        controller: _tabController,
                        children: [
                          _MeetingList(
                            meetings: _liveMeetings,
                            emptyTitle: 'No live sessions',
                            emptySubtitle: 'Currently no sessions are live',
                            onRefresh: _loadData,
                            onJoin: _joinMeeting,
                            onEnd: _endMeeting,
                            canManage: canCreate,
                          ),
                          _MeetingList(
                            meetings: _upcomingMeetings,
                            emptyTitle: 'No upcoming sessions',
                            emptySubtitle: 'Scheduled sessions will appear here',
                            onRefresh: _loadData,
                            onStart: _startMeeting,
                            canManage: canCreate,
                          ),
                          _MeetingList(
                            meetings: _pastMeetings,
                            emptyTitle: 'No past sessions',
                            emptySubtitle: 'Completed sessions will appear here',
                            onRefresh: _loadData,
                            canManage: false,
                          ),
                        ],
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

  Future<void> _startMeeting(Meeting meeting) async {
    try {
      await apiService.startMeeting(meeting.id);
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Session started'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  Future<void> _endMeeting(Meeting meeting) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('End Session'),
        content: const Text('Are you sure you want to end this session?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.error),
            child: const Text('End Session'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await apiService.endMeeting(meeting.id);
      await _loadData();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }
}

class _MeetingList extends StatelessWidget {
  final List<Meeting> meetings;
  final String emptyTitle;
  final String emptySubtitle;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Meeting)? onJoin;
  final Future<void> Function(Meeting)? onStart;
  final Future<void> Function(Meeting)? onEnd;
  final bool canManage;

  const _MeetingList({
    required this.meetings,
    required this.emptyTitle,
    required this.emptySubtitle,
    required this.onRefresh,
    this.onJoin,
    this.onStart,
    this.onEnd,
    this.canManage = false,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: meetings.isEmpty
          ? EmptyState(icon: Icons.video_call_outlined, title: emptyTitle, subtitle: emptySubtitle)
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: meetings.length,
              itemBuilder: (context, index) {
                final meeting = meetings[index];
                return MeetingCard(
                  meeting: meeting,
                  onTap: () => context.push('/sessions/${meeting.id}'),
                  onJoin: (onJoin != null && meeting.isLive) ? () => onJoin!(meeting) : null,
                  onStart: (onStart != null && canManage && meeting.isScheduled) ? () => onStart!(meeting) : null,
                  onEnd: (onEnd != null && canManage && meeting.isLive) ? () => onEnd!(meeting) : null,
                );
              },
            ),
    );
  }
}
