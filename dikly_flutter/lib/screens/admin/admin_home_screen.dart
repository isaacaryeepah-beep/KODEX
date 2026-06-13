import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _adminDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getAdminDashboardData(),
);

class AdminHomeScreen extends ConsumerWidget {
  const AdminHomeScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_adminDashProvider);
    final firstName = (user?.name ?? 'Admin').split(' ').first;
    final institution = user?.company ?? 'your institution';
    final instCode = user?.institutionCode ?? '';

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_adminDashProvider),
      color: DiklyColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Welcome row + institution code card
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()}, $firstName 👋',
                      style: GoogleFonts.dmSans(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: DiklyColors.text,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Here's what's happening at $institution today.",
                      style: const TextStyle(fontSize: 13, color: DiklyColors.textLight),
                    ),
                  ],
                ),
              ),
              if (instCode.isNotEmpty) ...[
                const SizedBox(width: 12),
                DiklyCard(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const Text('INSTITUTION CODE', style: TextStyle(fontSize: 9, color: DiklyColors.textLight, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                      const SizedBox(height: 2),
                      Text(instCode, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: DiklyColors.text, letterSpacing: 1)),
                      const SizedBox(height: 6),
                      GestureDetector(
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: instCode));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Code copied!'), duration: Duration(seconds: 2)),
                          );
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: DiklyColors.grey100,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: DiklyColors.border),
                          ),
                          child: const Text('Copy', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),

          dashAsync.when(
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: DiklyColors.primary))),
            error: (e, _) => DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_off_rounded, size: 36, color: DiklyColors.textLight),
                  const SizedBox(height: 10),
                  const Text('Failed to load dashboard', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: () => ref.invalidate(_adminDashProvider),
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Retry'),
                    style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.primary, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                  ),
                ],
              ),
            ),
            data: (data) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 4 stat cards in a row
                Row(
                  children: [
                    _StatCard(
                      label: 'TOTAL USERS',
                      value: '${data['totalUsers'] ?? 0}',
                      subtitle: 'Students, lecturers & staff',
                      icon: Icons.people_outlined,
                      color: const Color(0xFF3B82F6),
                    ),
                    const SizedBox(width: 8),
                    _StatCard(
                      label: 'ACTIVE SESSIONS',
                      value: '${data['activeSessions'] ?? 0}',
                      subtitle: (data['activeSessions'] ?? 0) > 0 ? 'Live now' : 'No active sessions',
                      icon: Icons.circle,
                      color: DiklyColors.success,
                    ),
                    const SizedBox(width: 8),
                    _StatCard(
                      label: 'TOTAL SESSIONS',
                      value: '${data['totalSessions'] ?? 0}',
                      subtitle: 'All time',
                      icon: Icons.book_outlined,
                      color: const Color(0xFFF59E0B),
                    ),
                    const SizedBox(width: 8),
                    _StatCard(
                      label: 'PENDING APPROVALS',
                      value: '${data['pendingApprovals'] ?? 0}',
                      subtitle: (data['pendingApprovals'] ?? 0) > 0 ? 'Action needed' : 'All clear',
                      icon: Icons.info_outline_rounded,
                      color: const Color(0xFF7C3AED),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Quick Actions
                const Text('QUICK ACTIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textLight, letterSpacing: 0.5)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/admin/users'),
                        icon: const Icon(Icons.person_add_alt_1_outlined, size: 15),
                        label: const Text('Add user'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.success,
                          side: const BorderSide(color: DiklyColors.success),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/announcements'),
                        icon: const Icon(Icons.campaign_outlined, size: 15),
                        label: const Text('Post announcement'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFF59E0B),
                          side: const BorderSide(color: Color(0xFFF59E0B)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/admin/reports'),
                        icon: const Icon(Icons.bar_chart_rounded, size: 15),
                        label: const Text('View reports'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.textSecondary,
                          side: const BorderSide(color: DiklyColors.border),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Two-column panels: recent sessions + announcements
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _SessionsPanel(
                        sessions: (data['sessions'] as List? ?? []).cast<Map<String, dynamic>>(),
                        onViewAll: () => context.push('/admin/sessions'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _AnnouncementsPanel(
                        announcements: (data['announcements'] as List? ?? []).cast<Map<String, dynamic>>(),
                        onPost: () => context.push('/announcements'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Chart placeholders
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _ChartPlaceholder(title: 'Attendance Trend (Last 14 Days)')),
                    const SizedBox(width: 12),
                    Expanded(child: _ChartPlaceholder(title: 'Users by Role')),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String subtitle;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.subtitle,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 8, color: Color(0xFF9CA3AF), letterSpacing: 0.2, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 8, color: Color(0xFF9CA3AF)),
            ),
          ],
        ),
      ),
    );
  }
}

class _SessionsPanel extends StatelessWidget {
  final List<Map<String, dynamic>> sessions;
  final VoidCallback onViewAll;
  const _SessionsPanel({required this.sessions, required this.onViewAll});

  String _timeAgo(dynamic rawDate) {
    if (rawDate == null) return '';
    final dt = DateTime.tryParse(rawDate.toString());
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'just now';
  }

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: Text('Recent sessions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text))),
              GestureDetector(
                onTap: onViewAll,
                child: const Text('View all →', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (sessions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text('No sessions yet', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))),
            )
          else
            ...sessions.take(5).map((s) {
              final timeAgo = _timeAgo(s['startedAt'] ?? s['createdAt']);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(right: 8, top: 2),
                      decoration: const BoxDecoration(
                        color: Color(0xFFD1D5DB),
                        shape: BoxShape.circle,
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s['title'] ?? 'Untitled', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis),
                          Text(s['createdBy']?['name'] ?? '', style: const TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                        ],
                      ),
                    ),
                    if (timeAgo.isNotEmpty)
                      Text(timeAgo, style: const TextStyle(fontSize: 10, color: DiklyColors.textLight)),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _AnnouncementsPanel extends StatelessWidget {
  final List<Map<String, dynamic>> announcements;
  final VoidCallback onPost;
  const _AnnouncementsPanel({required this.announcements, required this.onPost});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: Text('Announcements', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text))),
              GestureDetector(
                onTap: onPost,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: DiklyColors.grey100,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: const Text('+ Post', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (announcements.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text('No announcements yet', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))),
            )
          else
            ...announcements.map((a) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(right: 8, top: 4),
                      decoration: const BoxDecoration(color: Color(0xFFD1D5DB), shape: BoxShape.circle),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(a['title'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis),
                          Text(
                            a['audience'] == 'all' ? 'Everyone' : (a['audience']?.toString() ?? ''),
                            style: const TextStyle(fontSize: 10, color: DiklyColors.textLight),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _ChartPlaceholder extends StatelessWidget {
  final String title;
  const _ChartPlaceholder({required this.title});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}
