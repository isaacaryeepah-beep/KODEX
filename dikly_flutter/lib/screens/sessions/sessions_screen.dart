import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/ds/dikly_ds.dart';

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Attendance Sessions',
              subtitle: 'Manage and view all sessions',
              action: canCreate
                  ? ElevatedButton.icon(
                      onPressed: () => context.push('/sessions/create'),
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('New Session'),
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
          // Tab bar
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            decoration: BoxDecoration(
              color: DiklyColors.grey100,
              borderRadius: BorderRadius.circular(10),
            ),
            padding: const EdgeInsets.all(4),
            child: TabBar(
              controller: _tabController,
              indicator: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                boxShadow: AppTheme.shadowSm,
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              dividerColor: Colors.transparent,
              tabs: [
                Tab(text: 'Live (${_liveMeetings.length})'),
                Tab(text: 'Upcoming (${_upcomingMeetings.length})'),
                Tab(text: 'Past'),
              ],
              labelColor: DiklyColors.text,
              unselectedLabelColor: DiklyColors.textLight,
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              unselectedLabelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(height: 8),
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
                          _SessionList(
                            meetings: _liveMeetings,
                            emptyTitle: 'No live sessions',
                            emptySubtitle: 'Currently no sessions are live',
                            onRefresh: _loadData,
                            onJoin: _joinMeeting,
                            onEnd: _endMeeting,
                            canManage: canCreate,
                          ),
                          _SessionList(
                            meetings: _upcomingMeetings,
                            emptyTitle: 'No upcoming sessions',
                            emptySubtitle: 'Scheduled sessions will appear here',
                            onRefresh: _loadData,
                            onStart: _startMeeting,
                            canManage: canCreate,
                          ),
                          _SessionList(
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

class _SessionList extends StatelessWidget {
  final List<Meeting> meetings;
  final String emptyTitle;
  final String emptySubtitle;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Meeting)? onJoin;
  final Future<void> Function(Meeting)? onStart;
  final Future<void> Function(Meeting)? onEnd;
  final bool canManage;

  const _SessionList({
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
          ? DiklyEmptyState(
              icon: Icons.video_call_outlined,
              title: emptyTitle,
              subtitle: emptySubtitle,
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: meetings.length,
              itemBuilder: (context, index) {
                final meeting = meetings[index];
                return _SessionCard(
                  meeting: meeting,
                  canManage: canManage,
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

class _SessionCard extends StatelessWidget {
  final Meeting meeting;
  final bool canManage;
  final VoidCallback onTap;
  final VoidCallback? onJoin;
  final VoidCallback? onStart;
  final VoidCallback? onEnd;

  const _SessionCard({
    required this.meeting,
    required this.canManage,
    required this.onTap,
    this.onJoin,
    this.onStart,
    this.onEnd,
  });

  Color get _statusColor {
    if (meeting.isLive) return DiklyColors.success;
    if (meeting.isEnded) return DiklyColors.textLight;
    return DiklyColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    final dateStr = meeting.scheduledStart != null
        ? DateFormat('EEE, MMM d · h:mm a').format(meeting.scheduledStart!)
        : '';
    final presentCount = meeting.participantCount ?? 0;

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: _statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.video_camera_front_outlined, color: _statusColor, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      meeting.title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.text,
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Course label chip
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: DiklyColors.primaryULight,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        meeting.meetingType[0].toUpperCase() + meeting.meetingType.substring(1),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Status badge
              DiklyBadge(
                label: meeting.statusLabel,
                color: _statusColor,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Date + present count
          Row(
            children: [
              if (dateStr.isNotEmpty) ...[
                DiklyInfoChip(
                  icon: Icons.calendar_today_outlined,
                  label: dateStr,
                ),
                const SizedBox(width: 8),
              ],
              if (presentCount > 0) ...[
                DiklyInfoChip(
                  icon: Icons.people_outline_rounded,
                  label: '$presentCount present',
                  color: DiklyColors.success,
                  bg: DiklyColors.successLight,
                ),
              ],
            ],
          ),
          // Action buttons
          if (onJoin != null || onStart != null || onEnd != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (onJoin != null)
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: onJoin,
                      icon: const Icon(Icons.video_call_rounded, size: 16),
                      label: const Text('Join'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.success,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                    ),
                  ),
                if (onStart != null)
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: onStart,
                      icon: const Icon(Icons.play_arrow_rounded, size: 16),
                      label: const Text('Start'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                      ),
                    ),
                  ),
                if (onEnd != null) ...[
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: onEnd,
                    icon: const Icon(Icons.stop_rounded, size: 16),
                    label: const Text('End'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DiklyColors.error,
                      side: const BorderSide(color: DiklyColors.error),
                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}
