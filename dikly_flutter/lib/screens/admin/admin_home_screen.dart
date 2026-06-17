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
    final user      = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_adminDashProvider);
    final firstName = (user?.name ?? 'Admin').split(' ').first;
    final instCode  = user?.institutionCode ?? '';

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_adminDashProvider),
        color: _theme.primary,
        child: dashAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: const [
              SizedBox(height: 8),
              DiklyShimmerCard(height: 72),
              SizedBox(height: 16),
              DiklyShimmerGrid(),
              SizedBox(height: 20),
              DiklyShimmerList(count: 4),
            ],
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              DiklyErrorView(
                message: e.toString().replaceAll('Exception: ', ''),
                onRetry: () => ref.invalidate(_adminDashProvider),
              ),
            ],
          ),
          data: (d) => _buildContent(context, ref, d, user, firstName, instCode),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> d,
    dynamic user,
    String firstName,
    String instCode,
  ) {
    final sessions       = (d['recentSessions']  as List? ?? []);
    final announcements  = (d['announcements']   as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // ── Greeting row + institution code card ──────────────────────
        DiklyFadeIn(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()}, $firstName',
                      style: GoogleFonts.dmSans(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: DiklyColors.text,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      user?.company ?? user?.institutionCode ?? 'Admin Portal',
                      style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                    ),
                  ],
                ),
              ),
              if (instCode.isNotEmpty) ...[
                const SizedBox(width: 12),
                _CodeCard(code: instCode),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),

        // ── Quick actions ──────────────────────────────────────────────
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.person_add_outlined,    label: 'Add User',   color: const Color(0xFF059669), onTap: () => context.push('/admin/users')),
                DiklyQuickChip(icon: Icons.campaign_outlined,      label: 'Announce',   color: const Color(0xFFD97706), onTap: () => context.push('/announcements')),
                DiklyQuickChip(icon: Icons.bar_chart_rounded,      label: 'Reports',    color: _theme.primary,          onTap: () => context.push('/reports')),
                DiklyQuickChip(icon: Icons.pending_actions_outlined,label: 'Approvals', color: const Color(0xFFDC2626), onTap: () => context.push('/admin/users')),
                DiklyQuickChip(icon: Icons.account_tree_outlined,  label: 'Branches',   color: const Color(0xFF0891B2), onTap: () => context.push('/admin/branches')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),

        // ── Stat cards v2 (4px top bar + icon circle, web style) ──────
        DiklyFadeIn(
          delay: const Duration(milliseconds: 80),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [
              _AdminStatCard(
                value: '${d['totalUsers'] ?? 0}',
                label: 'Total Users',
                trend: 'USERS',
                icon: Icons.people_rounded,
                color: _theme.primary,
              ),
              _AdminStatCard(
                value: '${d['activeSessions'] ?? 0}',
                label: 'Active Sessions',
                trend: 'NOW',
                icon: Icons.video_call_rounded,
                color: const Color(0xFF059669),
              ),
              _AdminStatCard(
                value: '${d['totalSessions'] ?? 0}',
                label: 'Total Sessions',
                icon: Icons.history_rounded,
                color: const Color(0xFF0891B2),
              ),
              _AdminStatCard(
                value: '${d['pendingApprovals'] ?? 0}',
                label: 'Pending Approvals',
                icon: Icons.pending_rounded,
                color: const Color(0xFFD97706),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // ── Two-column: Recent sessions | Announcements ────────────────
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
    final color  = isLive ? const Color(0xFF16A34A) : const Color(0xFF6B7280);
    String sub   = s['createdBy'] ?? s['lecturer'] ?? '';
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
    if (diff.inHours < 24)  return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

// ── Institution code card ─────────────────────────────────────────────────────

class _CodeCard extends StatelessWidget {
  final String code;
  const _CodeCard({required this.code});

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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
          boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 1))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'INST. CODE',
              style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 0.8),
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  code,
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w800, color: DiklyColors.text, letterSpacing: 0.5),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.copy_rounded, size: 13, color: Color(0xFF9CA3AF)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Admin stat card v2: 4px top accent + icon circle + big number ─────────────

class _AdminStatCard extends StatelessWidget {
  final String value;
  final String label;
  final IconData icon;
  final Color color;
  final String? trend;

  const _AdminStatCard({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
    this.trend,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(
          top:    BorderSide(color: color, width: 4),
          left:   const BorderSide(color: Color(0xFFE5E7EB)),
          right:  const BorderSide(color: Color(0xFFE5E7EB)),
          bottom: const BorderSide(color: Color(0xFFE5E7EB)),
        ),
        boxShadow: const [BoxShadow(color: Color(0x06000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 16, color: color),
              ),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: GoogleFonts.dmSans(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: DiklyColors.text,
              height: 1.0,
            ),
          ),
          if (trend != null) ...[
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                trend!,
                style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w700, color: color),
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            label.toUpperCase(),
            style: GoogleFonts.dmSans(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF9CA3AF),
              letterSpacing: 0.6,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
