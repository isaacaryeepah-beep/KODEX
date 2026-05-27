import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
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

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF0D9488), Color(0xFF0F766E)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${_getGreeting()},', style: const TextStyle(color: Colors.white70, fontSize: 14)),
              const SizedBox(height: 4),
              Text(name, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(DateFormat('EEEE, MMMM d').format(DateTime.now()), style: const TextStyle(color: Colors.white70, fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text('Overview', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.8,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            DiklyStatCard(label: 'Pending Leave', value: '$pendingLeave', color: DiklyColors.warning, icon: Icons.event_note_outlined),
            DiklyStatCard(label: 'Timesheets', value: '${_timesheets.length}', color: DiklyColors.primary, icon: Icons.schedule_outlined),
            DiklyStatCard(label: 'Meetings', value: '${_meetings.length}', color: const Color(0xFF0D9488), icon: Icons.video_call_outlined),
            DiklyStatCard(label: 'Live Sessions', value: '${_meetings.where((m) => m.isLive).length}', color: DiklyColors.success, icon: Icons.fiber_manual_record),
          ],
        ),
        const SizedBox(height: 20),
        Text('Quick Actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 3,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _GridAction(label: 'Team', icon: Icons.group_rounded, color: const Color(0xFF0D9488), onTap: () => context.go('/manager/team')),
            _GridAction(label: 'Leave', icon: Icons.event_note_rounded, color: DiklyColors.warning, onTap: () => context.go('/manager/leave-requests')),
            _GridAction(label: 'Timesheets', icon: Icons.schedule_rounded, color: DiklyColors.primary, onTap: () => context.go('/manager/timesheets')),
            _GridAction(label: 'Meetings', icon: Icons.video_call_rounded, color: DiklyColors.success, onTap: () => context.go('/meetings')),
            _GridAction(label: 'Reports', icon: Icons.bar_chart_rounded, color: const Color(0xFF7C3AED), onTap: () => context.go('/reports')),
            _GridAction(label: 'Announce', icon: Icons.campaign_rounded, color: DiklyColors.error, onTap: () => context.go('/announcements')),
          ],
        ),
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Recent Meetings', style: Theme.of(context).textTheme.titleLarge),
            TextButton(onPressed: () => context.go('/meetings'), child: const Text('See all')),
          ],
        ),
        const SizedBox(height: 8),
        if (_meetings.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            alignment: Alignment.center,
            child: const Text('No meetings scheduled', style: TextStyle(color: DiklyColors.textSecondary)),
          )
        else
          for (final meeting in _meetings.take(3))
            MeetingCard(
              meeting: meeting,
              onJoin: meeting.isLive ? () => _joinMeeting(meeting) : null,
            ),
        const SizedBox(height: 32),
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
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }
}

class _GridAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _GridAction({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(height: 6),
            Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
