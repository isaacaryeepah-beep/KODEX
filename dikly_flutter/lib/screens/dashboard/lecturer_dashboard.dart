import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../models/course.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/stat_card.dart';
import '../../widgets/meeting_card.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/ds/empty_state.dart';

class LecturerDashboard extends ConsumerStatefulWidget {
  const LecturerDashboard({super.key});

  @override
  ConsumerState<LecturerDashboard> createState() => _LecturerDashboardState();
}

class _LecturerDashboardState extends ConsumerState<LecturerDashboard> {
  List<Meeting> _meetings = [];
  List<Course> _courses = [];
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
        apiService.getCourses(),
      ]);
      setState(() {
        _meetings = results[0] as List<Meeting>;
        _courses = results[1] as List<Course>;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
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
                : _buildContent(user?.name ?? 'Lecturer'),
      ),
    );
  }

  Widget _buildContent(String name) {
    final liveMeetings = _meetings.where((m) => m.isLive).toList();
    final upcomingMeetings = _meetings.where((m) => m.isScheduled).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF7C3AED), Color(0xFF5B21B6)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_getGreeting()},',
                style: const TextStyle(color: Colors.white70, fontSize: 14),
              ),
              const SizedBox(height: 4),
              Text(
                name,
                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
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
            SmallStatCard(label: 'My Courses', value: '${_courses.length}', color: const Color(0xFF7C3AED), icon: Icons.school_outlined),
            SmallStatCard(label: 'Live Now', value: '${liveMeetings.length}', color: DiklyColors.success, icon: Icons.fiber_manual_record_rounded),
            SmallStatCard(label: 'Upcoming', value: '${upcomingMeetings.length}', color: DiklyColors.warning, icon: Icons.schedule_outlined),
            SmallStatCard(label: 'Total Sessions', value: '${_meetings.length}', color: DiklyColors.primary, icon: Icons.video_call_outlined),
          ],
        ),
        const SizedBox(height: 20),
        // Quick Actions
        Text('Quick Actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _ActionChip(label: 'New Session', icon: Icons.add_circle_outline, onTap: () => context.push('/sessions/create')),
            _ActionChip(label: 'Attendance', icon: Icons.fact_check_outlined, onTap: () => context.go('/attendance')),
            _ActionChip(label: 'Assignments', icon: Icons.assignment_outlined, onTap: () => context.go('/assignments')),
            _ActionChip(label: 'Grade Book', icon: Icons.grade_outlined, onTap: () => context.go('/gradebook')),
            _ActionChip(label: 'Reports', icon: Icons.bar_chart_outlined, onTap: () => context.go('/reports')),
          ],
        ),
        const SizedBox(height: 20),
        // Live meetings
        if (liveMeetings.isNotEmpty) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Live Now', style: Theme.of(context).textTheme.titleLarge),
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(color: DiklyColors.success, shape: BoxShape.circle),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final meeting in liveMeetings.take(2))
            MeetingCard(
              meeting: meeting,
              onJoin: () => _joinMeeting(meeting),
              onEnd: () => _endMeeting(meeting),
            ),
          const SizedBox(height: 12),
        ],
        // My Courses
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('My Courses', style: Theme.of(context).textTheme.titleLarge),
            TextButton(onPressed: () => context.go('/courses'), child: const Text('See all')),
          ],
        ),
        const SizedBox(height: 8),
        if (_courses.isEmpty)
          const DiklyEmptyState(icon: Icons.school_outlined, title: 'No courses', subtitle: 'Your courses will appear here')
        else
          for (final course in _courses.take(3))
            _CourseTile(course: course),
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

  Future<void> _endMeeting(Meeting meeting) async {
    try {
      await apiService.endMeeting(meeting.id);
      await _loadData();
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

class _ActionChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _ActionChip({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Chip(
        avatar: Icon(icon, size: 16, color: DiklyColors.primary),
        label: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        backgroundColor: DiklyColors.primary.withOpacity(0.08),
        side: BorderSide(color: DiklyColors.primary.withOpacity(0.2)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      ),
    );
  }
}

class _CourseTile extends StatelessWidget {
  final Course course;
  const _CourseTile({required this.course});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: const Color(0xFF7C3AED).withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.school_outlined, color: Color(0xFF7C3AED), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(course.title, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                if (course.code != null)
                  Text(course.code!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
          ),
          Text('${course.studentCount ?? 0}', style: Theme.of(context).textTheme.labelMedium?.copyWith(color: DiklyColors.textSecondary)),
          const SizedBox(width: 4),
          const Icon(Icons.people_outline, size: 14, color: DiklyColors.textSecondary),
        ],
      ),
    );
  }
}
