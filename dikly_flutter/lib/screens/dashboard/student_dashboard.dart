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
import '../../models/assignment.dart';
import '../../models/attendance.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/meeting_card.dart';
import '../../widgets/ds/dikly_ds.dart';

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
    } catch (_) {
      setState(() { _loading = false; });
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
            ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
            : _buildContent(user?.name ?? 'Student'),
      ),
    );
  }

  Widget _buildContent(String name) {
    final firstName = name.split(' ').first;
    final attRate = _sessions.isNotEmpty
        ? (_presentSessions / _sessions.length * 100).round()
        : 0;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Greeting header — flat white, matching web
        WebGreetingHeader(
          greeting: 'Welcome back, $firstName',
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
              // Stats grid — matches web's 4-column colored top-bar cards
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.35,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  WebStatCard(
                    label: 'Total Check-Ins',
                    value: '$_presentSessions',
                    subtitle: 'This semester',
                    icon: Icons.fact_check_outlined,
                    color: DiklyColors.primary,
                  ),
                  WebStatCard(
                    label: 'Attendance Rate',
                    value: '$attRate%',
                    subtitle: attRate >= 80 ? 'Good standing' : 'Needs improvement',
                    icon: Icons.trending_up_outlined,
                    color: DiklyColors.success,
                  ),
                  WebStatCard(
                    label: 'Pending Tasks',
                    value: '$_pendingAssignments',
                    subtitle: _pendingAssignments == 0 ? 'All caught up' : 'Due soon',
                    icon: Icons.assignment_outlined,
                    color: DiklyColors.warning,
                  ),
                  WebStatCard(
                    label: 'Upcoming',
                    value: '${_meetings.length}',
                    subtitle: 'Sessions scheduled',
                    icon: Icons.video_call_outlined,
                    color: const Color(0xFF7C3AED),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Quick Actions — pill buttons matching web
              const WebSectionLabel(label: 'Quick Actions'),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    QuickActionPill(
                      icon: Icons.fact_check_rounded,
                      label: 'Mark Attendance',
                      color: DiklyColors.success,
                      onTap: () => context.go('/attendance'),
                    ),
                    const SizedBox(width: 8),
                    QuickActionPill(
                      icon: Icons.school_rounded,
                      label: 'My Courses',
                      color: DiklyColors.primary,
                      onTap: () => context.go('/courses'),
                    ),
                    const SizedBox(width: 8),
                    QuickActionPill(
                      icon: Icons.quiz_rounded,
                      label: 'Quizzes',
                      color: const Color(0xFF7C3AED),
                      onTap: () => context.go('/quizzes'),
                    ),
                    const SizedBox(width: 8),
                    QuickActionPill(
                      icon: Icons.description_outlined,
                      label: 'Report Card',
                      color: DiklyColors.textSecondary,
                      onTap: () => context.go('/gradebook'),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Recent Attendance section
              WebSectionHeader(
                title: 'Recent Attendance',
                actionLabel: 'View all →',
                onAction: () => context.go('/attendance'),
              ),
              if (_sessions.isEmpty)
                const WebEmptyCard(message: 'No attendance records yet')
              else
                _buildAttendanceTable(),

              const SizedBox(height: 20),

              // Pending Assignments
              WebSectionHeader(
                title: 'Pending Assignments',
                actionLabel: 'View all →',
                onAction: () => context.go('/assignments'),
              ),
              if (_assignments.where((a) => !a.isSubmitted).isEmpty)
                const WebEmptyCard(message: 'No pending assignments')
              else
                ..._assignments.where((a) => !a.isSubmitted).take(3).map(
                  (a) => _AssignmentTile(assignment: a),
                ),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAttendanceTable() {
    final recentSessions = _sessions.take(4).toList();
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        children: [
          // Table header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              color: Color(0xFFF9FAFB),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
            ),
            child: Row(
              children: [
                Expanded(flex: 3, child: Text('SESSION', style: _tableHeaderStyle)),
                Expanded(flex: 2, child: Text('STATUS', style: _tableHeaderStyle)),
                Expanded(flex: 3, child: Text('CHECK-IN TIME', style: _tableHeaderStyle)),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFE5E7EB)),
          // Rows
          ...recentSessions.map((s) => _AttendanceRow(session: s)),
        ],
      ),
    );
  }

  TextStyle get _tableHeaderStyle => GoogleFonts.dmSans(
    fontSize: 10,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.5,
    color: DiklyColors.textMuted,
  );

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

class _AttendanceRow extends StatelessWidget {
  final AttendanceSession session;
  const _AttendanceRow({required this.session});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFF3F4F6))),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              session.title ?? 'Session',
              style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w500, color: DiklyColors.text),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(
            flex: 2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: session.isMarked ? const Color(0xFFDCFCE7) : const Color(0xFFFEE2E2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                session.isMarked ? 'present' : 'absent',
                style: GoogleFonts.dmSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: session.isMarked ? DiklyColors.success : DiklyColors.error,
                ),
              ),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              session.startTime != null
                  ? DateFormat('M/d/yyyy, h:mm:ss a').format(session.startTime!)
                  : '—',
              style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
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
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: assignment.isOverdue ? DiklyColors.error.withOpacity(0.3) : const Color(0xFFE5E7EB),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: assignment.isOverdue
                  ? DiklyColors.error.withOpacity(0.1)
                  : DiklyColors.warning.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              Icons.assignment_outlined,
              color: assignment.isOverdue ? DiklyColors.error : DiklyColors.warning,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  assignment.title,
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
                  overflow: TextOverflow.ellipsis,
                ),
                if (assignment.dueDate != null)
                  Text(
                    'Due: ${DateFormat('MMM d, y').format(assignment.dueDate!)}',
                    style: GoogleFonts.dmSans(
                      fontSize: 12,
                      color: assignment.isOverdue ? DiklyColors.error : DiklyColors.textMuted,
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
              child: Text(
                'Overdue',
                style: GoogleFonts.dmSans(fontSize: 10, color: DiklyColors.error, fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ),
    );
  }
}
