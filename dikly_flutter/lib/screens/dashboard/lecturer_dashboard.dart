import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../models/course.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/meeting_card.dart';
import '../../widgets/ds/dikly_ds.dart';

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
            : _buildContent(user?.name ?? 'Lecturer'),
      ),
    );
  }

  Widget _buildContent(String name) {
    final liveMeetings = _meetings.where((m) => m.isLive).toList();
    final upcomingMeetings = _meetings.where((m) => m.isScheduled).toList();
    final firstName = name.split(' ').first;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Flat greeting header matching web
        WebGreetingHeader(
          greeting: '${_getGreeting()}, $firstName 👋',
          subtitle: 'Dikly · ${DateFormat('EEEE, d MMMM').format(DateTime.now())}',
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
              // Stats — 2x2 grid with top-border cards
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.35,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  WebStatCard(
                    label: 'My Courses',
                    value: '${_courses.length}',
                    subtitle: 'Teaching this term',
                    icon: Icons.school_outlined,
                    color: const Color(0xFF7C3AED),
                  ),
                  WebStatCard(
                    label: 'Live Now',
                    value: '${liveMeetings.length}',
                    subtitle: liveMeetings.isEmpty ? 'None active' : 'In session',
                    icon: Icons.fiber_manual_record_rounded,
                    color: DiklyColors.success,
                  ),
                  WebStatCard(
                    label: 'Upcoming',
                    value: '${upcomingMeetings.length}',
                    subtitle: 'Scheduled sessions',
                    icon: Icons.schedule_outlined,
                    color: DiklyColors.warning,
                  ),
                  WebStatCard(
                    label: 'Total Sessions',
                    value: '${_meetings.length}',
                    subtitle: 'All time',
                    icon: Icons.video_call_outlined,
                    color: DiklyColors.primary,
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Quick Actions — pill buttons
              const WebSectionLabel(label: 'Quick Actions'),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    QuickActionPill(
                      icon: Icons.add_circle_outline,
                      label: 'New Session',
                      color: const Color(0xFF7C3AED),
                      onTap: () => context.push('/sessions/create'),
                    ),
                    const SizedBox(width: 8),
                    QuickActionPill(
                      icon: Icons.fact_check_outlined,
                      label: 'Attendance',
                      color: DiklyColors.success,
                      onTap: () => context.go('/attendance'),
                    ),
                    const SizedBox(width: 8),
                    QuickActionPill(
                      icon: Icons.assignment_outlined,
                      label: 'Assignments',
                      color: DiklyColors.warning,
                      onTap: () => context.go('/assignments'),
                    ),
                    const SizedBox(width: 8),
                    QuickActionPill(
                      icon: Icons.grade_outlined,
                      label: 'Grade Book',
                      color: DiklyColors.primary,
                      onTap: () => context.go('/gradebook'),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Live meetings
              if (liveMeetings.isNotEmpty) ...[
                WebSectionHeader(title: 'Live Now'),
                ...liveMeetings.take(2).map((meeting) => MeetingCard(
                  meeting: meeting,
                  onJoin: () => _joinMeeting(meeting),
                  onEnd: () => _endMeeting(meeting),
                )),
                const SizedBox(height: 16),
              ],

              // My Courses
              WebSectionHeader(
                title: 'My Courses',
                actionLabel: 'View all →',
                onAction: () => context.go('/courses'),
              ),
              if (_courses.isEmpty)
                const WebEmptyCard(message: 'No courses assigned yet')
              else
                ..._courses.take(3).map((course) => _CourseTile(course: course)),

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
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _CourseTile extends StatelessWidget {
  final Course course;
  const _CourseTile({required this.course});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: const Color(0xFF7C3AED).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.school_outlined, color: Color(0xFF7C3AED), size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  course.title,
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
                  overflow: TextOverflow.ellipsis,
                ),
                if (course.code != null)
                  Text(
                    course.code!,
                    style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
                  ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${course.studentCount ?? 0}',
                style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted, fontWeight: FontWeight.w500),
              ),
              const SizedBox(width: 3),
              const Icon(Icons.people_outline, size: 14, color: DiklyColors.textMuted),
            ],
          ),
        ],
      ),
    );
  }
}
