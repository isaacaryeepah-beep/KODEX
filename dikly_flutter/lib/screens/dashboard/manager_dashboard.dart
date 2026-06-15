import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/meeting_card.dart';
import '../../widgets/ds/dikly_ds.dart';

class ManagerDashboard extends ConsumerStatefulWidget {
  const ManagerDashboard({super.key});

  @override
  ConsumerState<ManagerDashboard> createState() => _ManagerDashboardState();
}

class _ManagerDashboardState extends ConsumerState<ManagerDashboard> {
  List<Meeting> _meetings = [];
  List<dynamic> _leaveRequests = [];
  List<dynamic> _timesheets = [];
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
      final results = await Future.wait([
        apiService.getMeetings(),
        apiService.getLeaveRequests(),
        apiService.getTimesheets(),
      ]);
      setState(() {
        _meetings = results[0] as List<Meeting>;
        _leaveRequests = results[1] as List<dynamic>;
        _timesheets = results[2] as List<dynamic>;
        _loading = false;
      });
    } catch (_) {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    return AppShell(
      title: 'Dashboard',
      child: RefreshIndicator(
        onRefresh: _loadData,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
            : _buildContent(user?.name ?? 'Manager'),
      ),
    );
  }

  Widget _buildContent(String name) {
    final pendingLeave = _leaveRequests.where((l) {
      final status = (l as Map<String, dynamic>)['status']?.toString() ?? '';
      return status == 'pending';
    }).length;
    final firstName = name.split(' ').first;
    final liveSessions = _meetings.where((m) => m.isLive).length;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Flat greeting header
        WebGreetingHeader(
          greeting: '${_getGreeting()}, $firstName 👋',
          subtitle: "Here's what's happening with your team today.",
          institutionCode: 'DIKLY',
          onCopyCode: () {
            HapticFeedback.lightImpact();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Code copied!'), duration: Duration(seconds: 1)),
            );
          },
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Stat cards — 2x2 grid
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.35,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  WebStatCard(
                    label: 'Pending Leave',
                    value: '$pendingLeave',
                    subtitle: pendingLeave == 0 ? 'All clear' : 'Awaiting review',
                    icon: Icons.event_note_outlined,
                    color: DiklyColors.warning,
                  ),
                  WebStatCard(
                    label: 'Timesheets',
                    value: '${_timesheets.length}',
                    subtitle: 'This period',
                    icon: Icons.schedule_outlined,
                    color: DiklyColors.primary,
                  ),
                  WebStatCard(
                    label: 'Meetings',
                    value: '${_meetings.length}',
                    subtitle: 'Scheduled',
                    icon: Icons.video_call_outlined,
                    color: const Color(0xFF0D9488),
                  ),
                  WebStatCard(
                    label: 'Live Sessions',
                    value: '$liveSessions',
                    subtitle: liveSessions == 0 ? 'None active' : 'In progress',
                    icon: Icons.fiber_manual_record,
                    color: DiklyColors.success,
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Quick Actions
              const WebSectionLabel(label: 'Quick Actions'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  QuickActionPill(
                    icon: Icons.group_outlined,
                    label: 'View team',
                    color: const Color(0xFF0D9488),
                    onTap: () => context.go('/manager/team'),
                  ),
                  QuickActionPill(
                    icon: Icons.event_note_outlined,
                    label: 'Leave requests',
                    color: DiklyColors.warning,
                    onTap: () => context.go('/manager/leave-requests'),
                  ),
                  QuickActionPill(
                    icon: Icons.schedule_outlined,
                    label: 'Timesheets',
                    color: DiklyColors.primary,
                    onTap: () => context.go('/manager/timesheets'),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Meetings section
              WebSectionHeader(
                title: 'Upcoming Meetings',
                actionLabel: 'View all →',
                onAction: () => context.go('/meetings'),
              ),
              if (_meetings.isEmpty)
                const WebEmptyCard(message: 'No meetings scheduled')
              else
                ..._meetings.take(3).map((meeting) => MeetingCard(
                  meeting: meeting,
                  onJoin: meeting.isLive ? () => _joinMeeting(meeting) : null,
                )),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ],
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error));
    }
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}
