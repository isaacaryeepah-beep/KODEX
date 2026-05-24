import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../models/assignment.dart';
import '../../models/attendance.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/stat_card.dart';
import '../../widgets/meeting_card.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

class StudentDashboard extends ConsumerStatefulWidget {
  const StudentDashboard({super.key});

  @override
  ConsumerState<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends ConsumerState<StudentDashboard> {
  List<Meeting> _meetings = [];
  List<Assignment> _assignments = [];
  List<AttendanceSession> _sessions = [];
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
        apiService.getUpcomingMeetings(),
        apiService.getAssignments(),
        apiService.getAttendanceSessions(),
      ]);
      setState(() {
        _meetings = results[0] as List<Meeting>;
        _assignments = results[1] as List<Assignment>;
        _sessions = results[2] as List<AttendanceSession>;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  int get _pendingAssignments =>
      _assignments.where((a) => !a.isSubmitted && !a.isOverdue).length;
  int get _presentSessions =>
      _sessions.where((s) => s.isMarked).length;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    return AppShell(
      title: 'Dashboard',
      child: RefreshIndicator(
        onRefresh: _loadData,
        child: _loading
            ? const LoadingList()
            : _error != null
                ? _buildError()
                : _buildContent(user?.name ?? 'Student'),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
          const SizedBox(height: 12),
          Text(_error ?? 'Something went wrong'),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget _buildContent(String name) {
    final greeting = _getGreeting();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Greeting
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [DiklyColors.primary, DiklyColors.primaryDark],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$greeting,',
                style: const TextStyle(color: Colors.white70, fontSize: 14),
              ),
              const SizedBox(height: 4),
              Text(
                name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                DateFormat('EEEE, MMMM d').format(DateTime.now()),
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        // Stats
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
            SmallStatCard(
              label: 'Pending Tasks',
              value: '$_pendingAssignments',
              color: DiklyColors.warning,
              icon: Icons.assignment_outlined,
            ),
            SmallStatCard(
              label: 'Attended',
              value: '$_presentSessions',
              color: DiklyColors.success,
              icon: Icons.fact_check_outlined,
            ),
            SmallStatCard(
              label: 'Upcoming',
              value: '${_meetings.length}',
              color: DiklyColors.primary,
              icon: Icons.video_call_outlined,
            ),
            SmallStatCard(
              label: 'Sessions',
              value: '${_sessions.length}',
              color: const Color(0xFF7C3AED),
              icon: Icons.school_outlined,
            ),
          ],
        ),
        const SizedBox(height: 20),
        // Quick Actions
        Text('Quick Actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _QuickAction(
                label: 'Mark\nAttendance',
                icon: Icons.fact_check_rounded,
                color: DiklyColors.success,
                onTap: () => context.go('/attendance'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickAction(
                label: 'View\nAssignments',
                icon: Icons.assignment_rounded,
                color: DiklyColors.warning,
                onTap: () => context.go('/assignments'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickAction(
                label: 'Take\nQuiz',
                icon: Icons.quiz_rounded,
                color: DiklyColors.primary,
                onTap: () => context.go('/quizzes'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickAction(
                label: 'Course\nVideos',
                icon: Icons.play_circle_rounded,
                color: const Color(0xFF7C3AED),
                onTap: () => context.go('/courses'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        // Upcoming Meetings
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Upcoming Sessions', style: Theme.of(context).textTheme.titleLarge),
            TextButton(
              onPressed: () => context.go('/sessions'),
              child: const Text('See all'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_meetings.isEmpty)
          const EmptyState(
            icon: Icons.video_call_outlined,
            title: 'No upcoming sessions',
            subtitle: 'Your scheduled sessions will appear here',
          )
        else
          for (final meeting in _meetings.take(3))
            MeetingCard(
              meeting: meeting,
              onJoin: meeting.isLive
                  ? () => _joinMeeting(meeting)
                  : null,
            ),
        const SizedBox(height: 20),
        // Pending Assignments
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Pending Assignments', style: Theme.of(context).textTheme.titleLarge),
            TextButton(
              onPressed: () => context.go('/assignments'),
              child: const Text('See all'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_assignments.isEmpty)
          const EmptyState(
            icon: Icons.assignment_outlined,
            title: 'No assignments',
            subtitle: 'Your assignments will appear here',
          )
        else
          for (final assignment in _assignments.where((a) => !a.isSubmitted).take(3))
            _AssignmentTile(assignment: assignment),
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not join: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }
}

class _QuickAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssignmentTile extends StatelessWidget {
  final Assignment assignment;
  const _AssignmentTile({required this.assignment});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: assignment.isOverdue ? DiklyColors.error.withOpacity(0.3) : DiklyColors.border,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: assignment.isOverdue
                  ? DiklyColors.error.withOpacity(0.1)
                  : DiklyColors.warning.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.assignment_outlined,
              color: assignment.isOverdue ? DiklyColors.error : DiklyColors.warning,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  assignment.title,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (assignment.dueDate != null)
                  Text(
                    'Due: ${DateFormat('MMM d, y').format(assignment.dueDate!)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: assignment.isOverdue
                              ? DiklyColors.error
                              : DiklyColors.textSecondary,
                        ),
                  ),
              ],
            ),
          ),
          if (assignment.isOverdue)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: DiklyColors.error.withOpacity(0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'Overdue',
                style: TextStyle(
                  fontSize: 10,
                  color: DiklyColors.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
