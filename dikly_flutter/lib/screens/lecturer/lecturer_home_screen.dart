import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _lecturerDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getLecturerDashboardData(),
);

class LecturerHomeScreen extends ConsumerWidget {
  const LecturerHomeScreen({super.key});

  static const _theme = DiklyRoleTheme.lecturer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_lecturerDashProvider);
    final firstName = (user?.name ?? 'Lecturer').split(' ').first;

    return Column(
      children: [
          dashAsync.when(
            data: (d) => DiklyHeroSection(
              gradient: _theme.gradient,
              greeting: 'Hello, $firstName 👋',
              subtitle: '${user?.department ?? user?.institutionCode ?? 'Lecturer Portal'} · ${DateFormat('EEE, MMM d').format(DateTime.now())}',
              stats: [
                DiklyHeaderStat(value: '${d['totalStudents'] ?? 0}', label: 'Students', icon: Icons.people_outlined),
                DiklyHeaderStat(value: '${d['activeCourses'] ?? 0}', label: 'Courses', icon: Icons.school_outlined),
                DiklyHeaderStat(value: '${d['totalSessions'] ?? 0}', label: 'Sessions', icon: Icons.video_call_outlined),
              ],
            ),
            loading: () => DiklyHeroSection(
              gradient: _theme.gradient,
              greeting: 'Hello, $firstName 👋',
              subtitle: user?.institutionCode ?? 'Lecturer Portal',
              stats: [
                const DiklyHeaderStat(value: '—', label: 'Students'),
                const DiklyHeaderStat(value: '—', label: 'Courses'),
                const DiklyHeaderStat(value: '—', label: 'Sessions'),
              ],
            ),
            error: (_, __) => DiklyHeroSection(
              gradient: _theme.gradient,
              greeting: 'Hello, $firstName 👋',
              subtitle: user?.institutionCode ?? 'Lecturer Portal',
              stats: const [],
            ),
          ),
          DiklyPageBody(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(_lecturerDashProvider),
              color: _theme.primary,
              child: dashAsync.when(
                loading: () => ListView(
                  padding: const EdgeInsets.all(16),
                  children: const [
                    DiklyShimmerCard(height: 48, borderRadius: 999),
                    SizedBox(height: 20),
                    DiklyShimmerGrid(),
                    SizedBox(height: 20),
                    DiklyShimmerList(count: 4),
                  ],
                ),
                error: (e, _) => ListView(
                  padding: const EdgeInsets.all(24),
                  children: [DiklyErrorView(message: e.toString().replaceAll('Exception: ', ''), onRetry: () => ref.invalidate(_lecturerDashProvider))],
                ),
                data: (d) => _buildContent(context, ref, d, user),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, Map<String, dynamic> d, dynamic user) {
    final sessions = (d['recentSessions'] as List? ?? []);
    final meetings = (d['scheduledMeetings'] as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      children: [
        // Quick actions
        DiklyFadeIn(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.play_circle_outline_rounded, label: 'Start Session', color: _theme.primary, onTap: () => context.push('/sessions')),
                DiklyQuickChip(icon: Icons.school_outlined, label: 'Create Course', color: const Color(0xFF059669), onTap: () => context.push('/courses')),
                DiklyQuickChip(icon: Icons.quiz_outlined, label: 'Create Quiz', color: const Color(0xFF7C3AED), onTap: () => context.push('/quizzes')),
                DiklyQuickChip(icon: Icons.fact_check_outlined, label: 'Attendance', color: const Color(0xFF0891B2), onTap: () => context.push('/attendance')),
                DiklyQuickChip(icon: Icons.bar_chart_rounded, label: 'Reports', color: const Color(0xFFDC2626), onTap: () => context.push('/reports')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),

        // Stats grid
        DiklyFadeIn(
          delay: const Duration(milliseconds: 80),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.35,
            children: [
              WebStatCard(value: '${d['totalStudents'] ?? 0}', label: 'Total Students', subtitle: 'All courses', icon: Icons.people_rounded, color: _theme.primary),
              WebStatCard(value: '${d['activeCourses'] ?? 0}', label: 'Active Courses', subtitle: 'This term', icon: Icons.school_rounded, color: const Color(0xFF059669)),
              WebStatCard(value: '${d['totalSessions'] ?? 0}', label: 'Sessions Run', subtitle: 'All time', icon: Icons.video_call_rounded, color: const Color(0xFF0891B2)),
              WebStatCard(value: '${d['quizzesCreated'] ?? 0}', label: 'Quizzes Created', subtitle: 'Published', icon: Icons.quiz_rounded, color: const Color(0xFF7C3AED)),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // Recent sessions
        DiklyFadeIn(
          delay: const Duration(milliseconds: 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(
                title: 'Recent Sessions',
                count: sessions.length,
                onViewAll: () => context.push('/sessions'),
              ),
              if (sessions.isEmpty)
                const DiklyEmptyCard(icon: Icons.video_call_outlined, message: 'No sessions yet — start one above')
              else
                ...sessions.take(4).map((s) => _sessionTile(s, context)),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Upcoming meetings
        if (meetings.isNotEmpty) ...[
          DiklyFadeIn(
            delay: const Duration(milliseconds: 160),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklySectionRow(
                  title: 'Upcoming Meetings',
                  count: meetings.length,
                  onViewAll: () => context.push('/meetings'),
                ),
                ...meetings.take(3).map((m) => _meetingTile(m, context)),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _sessionTile(Map<String, dynamic> s, BuildContext context) {
    final status = (s['status'] ?? 'closed').toString().toLowerCase();
    final isLive = status == 'active' || status == 'open';
    final color = isLive ? const Color(0xFF16A34A) : const Color(0xFF6B7280);
    return DiklyListTile(
      title: s['title'] ?? s['courseTitle'] ?? 'Session',
      subtitle: s['startedAt'] != null
          ? DateFormat('MMM d, h:mm a').format(DateTime.tryParse(s['startedAt'].toString()) ?? DateTime.now())
          : (s['createdBy'] ?? ''),
      accentColor: color,
      badge: DiklyStatusPill.fromStatus(isLive ? 'live' : status),
      onTap: () => context.push('/sessions'),
      leadingIcon: Icons.video_call_outlined,
    );
  }

  Widget _meetingTile(Map<String, dynamic> m, BuildContext context) {
    final now = DateTime.now();
    final start = DateTime.tryParse(m['startTime']?.toString() ?? '');
    final end = DateTime.tryParse(m['endTime']?.toString() ?? '');
    final isLive = start != null && end != null && now.isAfter(start) && now.isBefore(end);
    final color = isLive ? const Color(0xFF16A34A) : DiklyColors.primary;

    String subtitle = '';
    if (start != null) subtitle = DateFormat('MMM d · h:mm a').format(start);

    return DiklyListTile(
      title: m['title'] ?? 'Meeting',
      subtitle: subtitle,
      accentColor: color,
      badge: DiklyStatusPill(label: isLive ? 'LIVE' : 'Scheduled', color: color, live: isLive),
      onTap: () => context.push('/meetings'),
      leadingIcon: Icons.groups_outlined,
    );
  }
}
