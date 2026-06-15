import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getHodOverview(),
);
final _hodApprovalsProvider = FutureProvider.autoDispose<int>((ref) async {
  try {
    final data = await apiService.getPendingApprovals();
    return (data as List?)?.length ?? 0;
  } catch (_) { return 0; }
});

class HodHomeScreen extends ConsumerWidget {
  const HodHomeScreen({super.key});

  static const _theme = DiklyRoleTheme.hod;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_hodDashProvider);
    final approvalsAsync = ref.watch(_hodApprovalsProvider);
    final firstName = (user?.name ?? 'HOD').split(' ').first;
    final pendingCount = approvalsAsync.value ?? 0;

    final h = DateTime.now().hour;
    final greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    final subtitle = '${user?.department ?? 'Department'} · ${user?.institutionCode ?? 'HOD Portal'}';

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_hodDashProvider);
          ref.invalidate(_hodApprovalsProvider);
        },
        color: _theme.primary,
        child: dashAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SizedBox(height: 12),
              _Greeting(greeting: greeting, firstName: firstName, subtitle: subtitle),
              const SizedBox(height: 16),
              const DiklyShimmerGrid(),
              const SizedBox(height: 20),
              const DiklyShimmerList(count: 4),
            ],
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [DiklyErrorView(message: e.toString().replaceAll('Exception: ', ''), onRetry: () => ref.invalidate(_hodDashProvider))],
          ),
          data: (d) => _buildContent(context, ref, d, user, pendingCount, greeting, firstName, subtitle),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, Map<String, dynamic> d, dynamic user, int pendingCount, String greeting, String firstName, String subtitle) {
    final sessions = (d['recentSessions'] as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        DiklyFadeIn(child: _Greeting(greeting: greeting, firstName: firstName, subtitle: subtitle)),
        const SizedBox(height: 18),

        // Stat cards 2×2
        DiklyFadeIn(
          delay: const Duration(milliseconds: 50),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [
              _BStat(value: '${d['lecturers'] ?? 0}', title: 'LECTURERS', subtitle: 'In department', icon: Icons.person_rounded, color: _theme.primary),
              _BStat(value: '${d['students'] ?? 0}', title: 'STUDENTS', subtitle: 'Enrolled', icon: Icons.people_rounded, color: const Color(0xFF7C3AED)),
              _BStat(value: '${d['recentSessionsCount'] ?? sessions.length}', title: 'SESSIONS', subtitle: 'Total run', icon: Icons.video_call_rounded, color: const Color(0xFF059669)),
              _BStat(value: '${d['liveNow'] ?? 0}', title: 'LIVE NOW', subtitle: (d['liveNow'] ?? 0) > 0 ? 'Active' : 'No live sessions', icon: Icons.live_tv_rounded, color: const Color(0xFFDC2626)),
            ],
          ),
        ),
        const SizedBox(height: 18),

        // Department warning
        if (user?.department == null || (user?.department?.isEmpty ?? true)) ...[
          _DepartmentWarning(),
          const SizedBox(height: 16),
        ],

        // Quick actions
        DiklyFadeIn(
          delay: const Duration(milliseconds: 100),
          child: Text('QUICK ACTIONS', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.5)),
        ),
        const SizedBox(height: 10),
        DiklyFadeIn(
          delay: const Duration(milliseconds: 110),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.pending_actions_outlined, label: 'Approvals${pendingCount > 0 ? ' ($pendingCount)' : ''}', color: const Color(0xFFDC2626), onTap: () => context.push('/hod/approvals')),
                DiklyQuickChip(icon: Icons.campaign_outlined, label: 'Announce', color: _theme.primary, onTap: () => context.push('/announcements')),
                DiklyQuickChip(icon: Icons.bar_chart_rounded, label: 'Reports', color: const Color(0xFF7C3AED), onTap: () => context.push('/reports')),
                DiklyQuickChip(icon: Icons.school_outlined, label: 'Courses', color: const Color(0xFF059669), onTap: () => context.push('/hod/course-approvals')),
                DiklyQuickChip(icon: Icons.notifications_active_outlined, label: 'Alerts', color: const Color(0xFFD97706), onTap: () => context.push('/hod/alerts')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),

        // Recent sessions
        DiklyFadeIn(
          delay: const Duration(milliseconds: 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(title: 'Recent Sessions', count: sessions.length, onViewAll: () => context.push('/sessions')),
              if (sessions.isEmpty)
                const DiklyEmptyCard(icon: Icons.video_call_outlined, message: 'No sessions yet')
              else
                ...sessions.take(4).map((s) => _sessionTile(s)),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Quick menu
        DiklyFadeIn(
          delay: const Duration(milliseconds: 160),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const DiklySectionRow(title: 'Quick Menu'),
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE4E4E7)),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))],
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                child: Column(
                  children: [
                    DiklyMenuRow(icon: Icons.people_outlined, label: 'View Lecturers', color: _theme.primary, onTap: () => context.push('/hod/lecturers')),
                    const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    DiklyMenuRow(icon: Icons.school_outlined, label: 'View Students', color: const Color(0xFF7C3AED), onTap: () => context.push('/hod/locked-students')),
                    const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    DiklyMenuRow(icon: Icons.bar_chart_outlined, label: 'Department Reports', color: const Color(0xFF059669), onTap: () => context.push('/reports')),
                    const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    DiklyMenuRow(icon: Icons.trending_up_rounded, label: 'Performance Dashboard', color: const Color(0xFF0891B2), onTap: () => context.push('/hod/performance')),
                    const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    DiklyMenuRow(icon: Icons.notifications_active_outlined, label: 'Smart Alerts', color: const Color(0xFFD97706), onTap: () => context.push('/hod/alerts')),
                    const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    DiklyMenuRow(icon: Icons.pending_actions_outlined, label: 'Pending Approvals', color: const Color(0xFFDC2626), badge: pendingCount > 0 ? pendingCount : null, onTap: () => context.push('/hod/approvals')),
                    const Divider(height: 1, color: Color(0xFFF3F4F6)),
                    DiklyMenuRow(icon: Icons.book_outlined, label: 'Course Approvals', color: const Color(0xFF059669), onTap: () => context.push('/hod/course-approvals')),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _sessionTile(Map<String, dynamic> s) {
    final status = (s['status'] ?? 'closed').toString().toLowerCase();
    final isLive = status == 'active' || status == 'open';
    final color = isLive ? const Color(0xFF16A34A) : const Color(0xFF6B7280);
    return DiklyListTile(
      title: s['title'] ?? 'Session',
      subtitle: s['createdBy'] ?? s['lecturer'] ?? '',
      accentColor: color,
      badge: DiklyStatusPill.fromStatus(isLive ? 'live' : status),
      leadingIcon: Icons.video_call_outlined,
    );
  }
}

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
        Text('$greeting, $firstName 👋', style: GoogleFonts.dmSans(fontSize: 24, fontWeight: FontWeight.w800, color: const Color(0xFF0D1117), height: 1.2)),
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
          Icon(icon, size: 16, color: color),
          const Spacer(),
          Text(value, style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: color, height: 1)),
          const SizedBox(height: 2),
          Text(subtitle, style: GoogleFonts.dmSans(fontSize: 10, color: const Color(0xFF6B7280)), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(title, style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 0.8)),
        ],
      ),
    );
  }
}

class _DepartmentWarning extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFCD34D)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, color: Color(0xFFD97706), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'No department assigned. Contact your admin to complete your profile.',
              style: GoogleFonts.dmSans(fontSize: 12, color: const Color(0xFF92400E), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
