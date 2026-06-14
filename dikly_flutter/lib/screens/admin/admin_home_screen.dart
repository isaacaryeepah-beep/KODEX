import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
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
                data: (d) => _buildContent(context, ref, d, user, instCode),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, Map<String, dynamic> d, dynamic user, String instCode) {
    final sessions = (d['recentSessions'] as List? ?? []);
    final announcements = (d['announcements'] as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      children: [
        // Quick actions
        DiklyFadeIn(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.person_add_outlined, label: 'Add User', color: const Color(0xFF059669), onTap: () => context.push('/admin/users')),
                DiklyQuickChip(icon: Icons.campaign_outlined, label: 'Announce', color: const Color(0xFFD97706), onTap: () => context.push('/announcements')),
                DiklyQuickChip(icon: Icons.bar_chart_rounded, label: 'Reports', color: _theme.primary, onTap: () => context.push('/reports')),
                DiklyQuickChip(icon: Icons.pending_actions_outlined, label: 'Approvals', color: const Color(0xFFDC2626), onTap: () => context.push('/admin/users')),
                DiklyQuickChip(icon: Icons.account_tree_outlined, label: 'Branches', color: const Color(0xFF0891B2), onTap: () => context.push('/admin/branches')),
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

        // Announcements
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
            Text(
              code,
              style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 1),
            ),
            const SizedBox(width: 6),
            Icon(Icons.copy_rounded, size: 13, color: Colors.white.withOpacity(0.8)),
          ],
        ),
      ),
    );
  }
}
