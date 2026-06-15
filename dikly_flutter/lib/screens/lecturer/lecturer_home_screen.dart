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

  static const _color = Color(0xFFD97706);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_lecturerDashProvider);
    final firstName = (user?.name ?? 'Lecturer').split(' ').first;
    final h = DateTime.now().hour;
    final greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_lecturerDashProvider),
        color: _color,
        child: dashAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SizedBox(height: 12),
              _Greeting(greeting: greeting, firstName: firstName, subtitle: '${user?.department ?? user?.institutionCode ?? 'Lecturer Portal'} · ${DateFormat('EEE, MMM d').format(DateTime.now())}'),
              const SizedBox(height: 16),
              const DiklyShimmerGrid(),
              const SizedBox(height: 20),
              const DiklyShimmerList(count: 4),
            ],
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [DiklyErrorView(message: e.toString().replaceAll('Exception: ', ''), onRetry: () => ref.invalidate(_lecturerDashProvider))],
          ),
          data: (d) => _buildContent(context, ref, d, user, greeting, firstName),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, Map<String, dynamic> d, dynamic user, String greeting, String firstName) {
    final sessions = (d['recentSessions'] as List? ?? []);
    final meetings = (d['scheduledMeetings'] as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        DiklyFadeIn(
          child: _Greeting(
            greeting: greeting,
            firstName: firstName,
            subtitle: '${user?.department ?? user?.institutionCode ?? 'Lecturer Portal'} · ${DateFormat('EEE, MMM d').format(DateTime.now())}',
          ),
        ),
        const SizedBox(height: 18),

        // Stats 2×2
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [
              _BStat(title: 'TOTAL STUDENTS', value: '${d['totalStudents'] ?? 0}', subtitle: 'Enrolled', icon: Icons.people_outlined, color: _color),
              _BStat(title: 'ACTIVE COURSES', value: '${d['activeCourses'] ?? 0}', subtitle: 'Running', icon: Icons.school_outlined, color: const Color(0xFF059669)),
              _BStat(title: 'SESSIONS RUN', value: '${d['totalSessions'] ?? 0}', subtitle: 'All time', icon: Icons.video_call_outlined, color: const Color(0xFF0891B2)),
              _BStat(title: 'QUIZZES CREATED', value: '${d['quizzesCreated'] ?? 0}', subtitle: 'Total', icon: Icons.quiz_outlined, color: const Color(0xFF7C3AED)),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Quick actions label
        DiklyFadeIn(
          delay: const Duration(milliseconds: 100),
          child: Text('QUICK ACTIONS', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.5)),
        ),
        const SizedBox(height: 10),

        DiklyFadeIn(
          delay: const Duration(milliseconds: 120),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.play_circle_outline_rounded, label: 'Start Session', color: _color, onTap: () => context.push('/sessions')),
                DiklyQuickChip(icon: Icons.school_outlined, label: 'Create Course', color: const Color(0xFF059669), onTap: () => context.push('/courses')),
                DiklyQuickChip(icon: Icons.quiz_outlined, label: 'Create Quiz', color: const Color(0xFF7C3AED), onTap: () => context.push('/quizzes')),
                DiklyQuickChip(icon: Icons.fact_check_outlined, label: 'Attendance', color: const Color(0xFF0891B2), onTap: () => context.push('/attendance')),
                DiklyQuickChip(icon: Icons.bar_chart_rounded, label: 'Reports', color: const Color(0xFFDC2626), onTap: () => context.push('/reports')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),

        // Recent sessions
        DiklyFadeIn(
          delay: const Duration(milliseconds: 140),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(title: 'Recent Sessions', count: sessions.length, onViewAll: () => context.push('/sessions')),
              if (sessions.isEmpty)
                const DiklyEmptyCard(icon: Icons.video_call_outlined, message: 'No sessions yet — start one above')
              else
                ...sessions.take(4).map((s) => _sessionTile(s, context)),
            ],
          ),
        ),

        if (meetings.isNotEmpty) ...[
          const SizedBox(height: 20),
          DiklyFadeIn(
            delay: const Duration(milliseconds: 160),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklySectionRow(title: 'Upcoming Meetings', count: meetings.length, onViewAll: () => context.push('/meetings')),
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
    final subtitle = start != null ? DateFormat('MMM d · h:mm a').format(start) : '';
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

// ── Shared widgets ────────────────────────────────────────────────────────────

class _Greeting extends StatelessWidget {
  final String greeting;
  final String firstName;
  final String subtitle;
  const _Greeting({required this.greeting, required this.firstName, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$greeting, $firstName 👋',
          style: GoogleFonts.dmSans(fontSize: 24, fontWeight: FontWeight.w800, color: const Color(0xFF0D1117), height: 1.2),
        ),
        const SizedBox(height: 4),
        Text(subtitle, style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF6B7280))),
      ],
    );
  }
}

class _BStat extends StatelessWidget {
  final String title, value, subtitle;
  final IconData icon;
  final Color color;
  const _BStat({required this.title, required this.value, required this.subtitle, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(
          top: BorderSide(color: color, width: 3),
          left: const BorderSide(color: Color(0xFFE5E7EB)),
          right: const BorderSide(color: Color(0xFFE5E7EB)),
          bottom: const BorderSide(color: Color(0xFFE5E7EB)),
        ),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [Icon(icon, size: 18, color: color)]),
          const Spacer(),
          Text(value, style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: const Color(0xFF0D1117), height: 1)),
          const SizedBox(height: 2),
          Text(subtitle, style: GoogleFonts.dmSans(fontSize: 10, color: const Color(0xFF6B7280)), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(title, style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 0.8)),
        ],
      ),
    );
  }
}
