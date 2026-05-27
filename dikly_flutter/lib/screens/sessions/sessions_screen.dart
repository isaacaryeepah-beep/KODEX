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
      setState(() { _allMeetings = []; _loading = false; });
    }
  }

  List<Meeting> get _liveMeetings => _allMeetings.where((m) => m.isLive).toList();
  List<Meeting> get _upcomingMeetings => _allMeetings.where((m) => m.isScheduled).toList();
  List<Meeting> get _pastMeetings => _allMeetings.where((m) => m.isEnded).toList();

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canCreate = user?.role == 'lecturer' || user?.role == 'admin' ||
        user?.role == 'hod' || user?.role == 'manager';

    return AppShell(
      title: 'Sessions',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Attendance Sessions',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Manage attendance sessions',
                  style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                ),
                if (canCreate) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => context.push('/sessions/create'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        elevation: 0,
                        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                      child: const Text('Start New Session'),
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 12),

          // ── Tab bar ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF3F4F6),
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
          ),

          const SizedBox(height: 8),

          // ── Tab content ──────────────────────────────────────────────
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _SessionList(
                        meetings: _liveMeetings,
                        emptyMessage: 'No sessions found',
                        onRefresh: _loadData,
                        onJoin: _joinMeeting,
                        onEnd: _endMeeting,
                        canManage: canCreate,
                      ),
                      _SessionList(
                        meetings: _upcomingMeetings,
                        emptyMessage: 'No upcoming sessions',
                        onRefresh: _loadData,
                        onStart: _startMeeting,
                        canManage: canCreate,
                      ),
                      _SessionList(
                        meetings: _pastMeetings,
                        emptyMessage: 'No past sessions',
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

// ── Session list ──────────────────────────────────────────────────────────────

class _SessionList extends StatelessWidget {
  final List<Meeting> meetings;
  final String emptyMessage;
  final Future<void> Function() onRefresh;
  final Future<void> Function(Meeting)? onJoin;
  final Future<void> Function(Meeting)? onStart;
  final Future<void> Function(Meeting)? onEnd;
  final bool canManage;

  const _SessionList({
    required this.meetings,
    required this.emptyMessage,
    required this.onRefresh,
    this.onJoin,
    this.onStart,
    this.onEnd,
    this.canManage = false,
  });

  @override
  Widget build(BuildContext context) {
    if (meetings.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: Text(
                emptyMessage,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: Color(0xFF9CA3AF)),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
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

// ── Session card ──────────────────────────────────────────────────────────────

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
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: DiklyColors.primaryULight,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        meeting.meetingType[0].toUpperCase() + meeting.meetingType.substring(1),
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.primary),
                      ),
                    ),
                  ],
                ),
              ),
              DiklyBadge(label: meeting.statusLabel, color: _statusColor),
            ],
          ),
          if (dateStr.isNotEmpty) ...[
            const SizedBox(height: 10),
            DiklyInfoChip(icon: Icons.calendar_today_outlined, label: dateStr),
          ],
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
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 8)),
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
