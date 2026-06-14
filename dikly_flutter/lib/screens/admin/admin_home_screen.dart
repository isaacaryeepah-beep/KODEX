import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _adminDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getAdminDashboardData(),
);

final _corpAdminDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getCorporateAdminDashboard(),
);

class AdminHomeScreen extends ConsumerWidget {
  const AdminHomeScreen({super.key});

  static const _theme = DiklyRoleTheme.admin;

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final isCorporate = user?.isCorporate ?? false;

    if (isCorporate) return _CorporateAdminHome(greeting: _greeting());

    // ── Academic admin ──────────────────────────────────────────────
    final dashAsync = ref.watch(_adminDashProvider);
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    final firstName = (user?.name ?? 'Admin').split(' ').first;
    final instCode = user?.institutionCode ?? '';

    return Column(
      children: [
        dashAsync.when(
          data: (d) => DiklyHeroSection(
            gradient: _theme.gradient,
            greeting: '$greeting, $firstName',
            subtitle: user?.institutionCode ?? 'Admin Portal',
            badge: instCode.isNotEmpty ? _CodeBadge(code: instCode) : null,
            stats: [
              DiklyHeaderStat(value: '${d['totalUsers'] ?? 0}', label: 'Users', icon: Icons.people_outlined),
              DiklyHeaderStat(value: '${d['activeSessions'] ?? 0}', label: 'Active', icon: Icons.video_call_outlined),
              DiklyHeaderStat(value: '${d['pendingApprovals'] ?? 0}', label: 'Pending', icon: Icons.pending_outlined),
            ],
          ),
          loading: () => DiklyHeroSection(
            gradient: _theme.gradient,
            greeting: '$greeting, $firstName',
            subtitle: user?.institutionCode ?? 'Admin Portal',
            stats: const [
              DiklyHeaderStat(value: '—', label: 'Users'),
              DiklyHeaderStat(value: '—', label: 'Active'),
              DiklyHeaderStat(value: '—', label: 'Pending'),
            ],
          ),
          error: (_, __) => DiklyHeroSection(
            gradient: _theme.gradient,
            greeting: '$greeting, $firstName',
            subtitle: user?.institutionCode ?? 'Admin Portal',
            stats: const [],
          ),
        ),
        DiklyPageBody(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(_adminDashProvider),
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
                children: [DiklyErrorView(message: e.toString().replaceAll('Exception: ', ''), onRetry: () => ref.invalidate(_adminDashProvider))],
              ),
              data: (d) => _buildAcademicContent(context, ref, d, user, instCode),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAcademicContent(BuildContext context, WidgetRef ref, Map<String, dynamic> d, dynamic user, String instCode) {
    final sessions = (d['recentSessions'] as List? ?? []);
    final announcements = (d['announcements'] as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      children: [
        DiklyFadeIn(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.person_add_outlined, label: 'Add User', color: const Color(0xFF059669), onTap: () => context.push('/admin/users')),
                DiklyQuickChip(icon: Icons.campaign_outlined, label: 'Announce', color: const Color(0xFFD97706), onTap: () => context.push('/announcements')),
                DiklyQuickChip(icon: Icons.bar_chart_rounded, label: 'Reports', color: _theme.primary, onTap: () => context.push('/reports')),
                DiklyQuickChip(icon: Icons.pending_actions_outlined, label: 'Approvals', color: const Color(0xFFDC2626), onTap: () => context.push('/admin/approvals')),
                DiklyQuickChip(icon: Icons.account_tree_outlined, label: 'Branches', color: const Color(0xFF0891B2), onTap: () => context.push('/admin/branches')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),
        DiklyFadeIn(
          delay: const Duration(milliseconds: 80),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.55,
            children: [
              DiklyGradientStat(value: '${d['totalUsers'] ?? 0}', label: 'Total Users', icon: Icons.people_rounded, color: _theme.primary),
              DiklyGradientStat(value: '${d['activeSessions'] ?? 0}', label: 'Active Sessions', icon: Icons.video_call_rounded, color: const Color(0xFF059669), trend: 'NOW'),
              DiklyGradientStat(value: '${d['totalSessions'] ?? 0}', label: 'All Sessions', icon: Icons.history_rounded, color: const Color(0xFF0891B2)),
              DiklyGradientStat(value: '${d['pendingApprovals'] ?? 0}', label: 'Pending Approvals', icon: Icons.pending_rounded, color: const Color(0xFFD97706)),
            ],
          ),
        ),
        const SizedBox(height: 22),
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
        DiklyFadeIn(
          delay: const Duration(milliseconds: 160),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(
                title: 'Announcements',
                onViewAll: () => context.push('/announcements'),
                viewAllLabel: '+ Post',
              ),
              if (announcements.isEmpty)
                const DiklyEmptyCard(icon: Icons.campaign_outlined, message: 'No announcements — post one above')
              else
                ...announcements.take(3).map((a) => _announcementTile(a)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _sessionTile(Map<String, dynamic> s) {
    final status = (s['status'] ?? 'closed').toString().toLowerCase();
    final isLive = status == 'active' || status == 'open';
    final color = isLive ? const Color(0xFF16A34A) : const Color(0xFF6B7280);
    String sub = s['createdBy'] ?? s['lecturer'] ?? '';
    if (s['createdAt'] != null) {
      final dt = DateTime.tryParse(s['createdAt'].toString());
      if (dt != null) sub = '${sub.isNotEmpty ? '$sub · ' : ''}${_timeAgo(dt)}';
    }
    return DiklyListTile(
      title: s['title'] ?? 'Session',
      subtitle: sub,
      accentColor: color,
      badge: DiklyStatusPill.fromStatus(isLive ? 'live' : status),
      leadingIcon: Icons.video_call_outlined,
    );
  }

  Widget _announcementTile(Map<String, dynamic> a) {
    return DiklyListTile(
      title: a['title'] ?? 'Announcement',
      subtitle: a['audience'] ?? a['target'] ?? 'All',
      accentColor: const Color(0xFFD97706),
      leadingIcon: Icons.campaign_outlined,
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

// ── Corporate admin home ──────────────────────────────────────────────────────

class _CorporateAdminHome extends ConsumerWidget {
  final String greeting;
  const _CorporateAdminHome({required this.greeting});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashAsync = ref.watch(_corpAdminDashProvider);
    final user = ref.watch(authProvider).user;
    final firstName = (user?.name ?? 'Admin').split(' ').first;
    final instCode = user?.institutionCode ?? '';

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_corpAdminDashProvider),
      color: DiklyColors.primary,
      child: dashAsync.when(
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            SizedBox(height: 20),
            DiklyShimmerGrid(),
            SizedBox(height: 20),
            DiklyShimmerList(count: 4),
          ],
        ),
        error: (e, _) => ListView(
          padding: const EdgeInsets.all(24),
          children: [DiklyErrorView(message: e.toString().replaceAll('Exception: ', ''), onRetry: () => ref.invalidate(_corpAdminDashProvider))],
        ),
        data: (d) => _buildContent(context, d, firstName, instCode),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Map<String, dynamic> d, String firstName, String instCode) {
    final sessions = (d['recentSessions'] as List? ?? []);
    final pendingCount = (d['pendingApprovals'] as num?)?.toInt() ?? 0;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      children: [
        // Greeting
        Text(
          '$greeting, $firstName 👋',
          style: GoogleFonts.dmSans(fontSize: 24, fontWeight: FontWeight.w800, color: const Color(0xFF111827)),
        ),
        const SizedBox(height: 4),
        Text(
          "Here's what's happening at Dikly.co today.",
          style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF6B7280)),
        ),
        const SizedBox(height: 16),

        // Institution code
        if (instCode.isNotEmpty) ...[
          _InstCodeRow(code: instCode),
          const SizedBox(height: 16),
        ],

        // Stats 2×2 grid — bordered, matching website
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.25,
          children: [
            _BorderedStat(
              title: 'TOTAL USERS',
              value: '${d['totalUsers'] ?? 0}',
              subtitle: 'Employees & managers',
              icon: Icons.person_outline,
              color: const Color(0xFF2563EB),
            ),
            _BorderedStat(
              title: 'ACTIVE SESSIONS',
              value: '${d['activeSessions'] ?? 0}',
              subtitle: (d['activeSessions'] ?? 0) == 0 ? 'No active sessions' : 'Live now',
              icon: Icons.access_time_outlined,
              color: const Color(0xFF0891B2),
            ),
            _BorderedStat(
              title: 'TOTAL SESSIONS',
              value: '${d['totalSessions'] ?? 0}',
              subtitle: 'All time',
              icon: Icons.book_outlined,
              color: const Color(0xFFD97706),
            ),
            _BorderedStat(
              title: 'PENDING APPROVALS',
              value: '$pendingCount',
              subtitle: pendingCount == 0 ? 'All clear' : 'Needs attention',
              icon: Icons.notifications_none_outlined,
              color: const Color(0xFF7C3AED),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Quick actions
        Text(
          'QUICK ACTIONS',
          style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.5),
        ),
        const SizedBox(height: 10),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 3.0,
          children: [
            _ActionBtn(icon: Icons.play_circle_outline, label: 'Start session', color: const Color(0xFF2563EB), onTap: () => context.push('/corporate-attendance')),
            _ActionBtn(icon: Icons.person_add_outlined, label: 'Add user', color: const Color(0xFF16A34A), onTap: () => context.push('/admin/users')),
            _ActionBtn(icon: Icons.campaign_outlined, label: 'Post announcement', color: const Color(0xFFD97706), onTap: () => context.push('/announcements')),
            _ActionBtn(icon: Icons.bar_chart_rounded, label: 'View reports', color: const Color(0xFF374151), onTap: () => context.push('/admin/reports')),
          ],
        ),
        const SizedBox(height: 20),

        // Recent sessions
        DiklySectionRow(
          title: 'Recent sessions',
          count: sessions.length,
          onViewAll: () => context.push('/corporate-attendance'),
        ),
        if (sessions.isEmpty)
          const DiklyEmptyCard(icon: Icons.people_outline, message: 'No sessions today')
        else
          ...sessions.map((s) {
            final name = s['employee']?['name'] ?? s['name'] ?? '—';
            final clockIn = s['clockIn']?['time']?.toString() ?? s['clockIn']?.toString() ?? '';
            final status = s['status']?.toString() ?? 'present';
            return DiklyListTile(
              title: name,
              subtitle: clockIn.isNotEmpty ? 'Clocked in at $clockIn' : 'Today',
              accentColor: DiklyColors.primary,
              badge: DiklyStatusPill.fromStatus(status),
            );
          }),
      ],
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _InstCodeRow extends StatelessWidget {
  final String code;
  const _InstCodeRow({required this.code});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      child: Row(
        children: [
          Text(
            'INSTITUTION CODE',
            style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.2),
          ),
          const SizedBox(width: 12),
          Text(
            code,
            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w800, color: const Color(0xFF111827), letterSpacing: 1),
          ),
          const Spacer(),
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: code));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Code copied'), duration: Duration(seconds: 2)),
              );
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFFD1D5DB)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('Copy', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: const Color(0xFF374151))),
            ),
          ),
        ],
      ),
    );
  }
}

class _BorderedStat extends StatelessWidget {
  final String title, value, subtitle;
  final IconData icon;
  final Color color;
  const _BorderedStat({required this.title, required this.value, required this.subtitle, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const Spacer(),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: const Color(0xFF111827), height: 1),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: GoogleFonts.dmSans(fontSize: 10, color: const Color(0xFF6B7280)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 0.8),
          ),
        ],
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionBtn({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.4), width: 1.5),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: const Color(0xFF374151)),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CodeBadge extends StatelessWidget {
  final String code;
  const _CodeBadge({required this.code});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: code));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Institution code copied'), duration: Duration(seconds: 2)),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.15),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.white.withOpacity(0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(code, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 1)),
            const SizedBox(width: 6),
            Icon(Icons.copy_rounded, size: 13, color: Colors.white.withOpacity(0.8)),
          ],
        ),
      ),
    );
  }
}
