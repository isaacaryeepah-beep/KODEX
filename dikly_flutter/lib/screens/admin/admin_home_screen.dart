import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
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
                      const Text('Institution code', style: TextStyle(fontSize: 10, color: DiklyColors.textLight, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(instCode, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: DiklyColors.text)),
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
                // 4 stat cards
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.45,
                  children: [
                    _StatCard(
                      title: 'Total users',
                      value: data['totalUsers'].toString(),
                      icon: Icons.people_outlined,
                      color: const Color(0xFF3B82F6),
                      subtitle: 'Students, lecturers & staff',
                      onTap: () => context.push('/admin/users'),
                    ),
                    _StatCard(
                      title: 'Active sessions',
                      value: data['activeSessions'].toString(),
                      icon: Icons.circle,
                      color: DiklyColors.success,
                      subtitle: data['activeSessions'] > 0 ? '● Live now' : 'No active sessions',
                      onTap: () => context.push('/sessions'),
                    ),
                    _StatCard(
                      title: 'Total sessions',
                      value: data['totalSessions'].toString(),
                      icon: Icons.book_outlined,
                      color: const Color(0xFFF59E0B),
                      subtitle: 'All time',
                      onTap: () => context.push('/sessions'),
                    ),
                    _StatCard(
                      title: 'Pending approvals',
                      value: data['pendingApprovals'].toString(),
                      icon: Icons.info_outline_rounded,
                      color: const Color(0xFF7C3AED),
                      subtitle: data['pendingApprovals'] > 0 ? 'Action needed' : 'All clear',
                      onTap: () => context.push('/sessions'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Quick actions
                const DiklySectionLabel('Quick actions'),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _ActionChip(
                      label: 'Add user',
                      icon: Icons.person_add_alt_1_outlined,
                      color: DiklyColors.success,
                      onTap: () => context.push('/admin/users'),
                    ),
                    if (data['pendingApprovals'] > 0)
                      _ActionChip(
                        label: 'Review approvals (${data['pendingApprovals']})',
                        icon: Icons.check_circle_outline,
                        color: const Color(0xFF7C3AED),
                        onTap: () => context.push('/sessions'),
                      ),
                    _ActionChip(
                      label: 'Post announcement',
                      icon: Icons.notifications_outlined,
                      color: const Color(0xFFF59E0B),
                      onTap: () => context.push('/announcements'),
                    ),
                    _ActionChip(
                      label: 'View reports',
                      icon: Icons.bar_chart_rounded,
                      color: DiklyColors.textSecondary,
                      onTap: () => context.push('/reports'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // 2 panels: recent sessions + announcements
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _SessionsPanel(
                        sessions: (data['sessions'] as List).cast<Map<String, dynamic>>(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _AnnouncementsPanel(
                        announcements: (data['announcements'] as List).cast<Map<String, dynamic>>(),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Admin actions
                const DiklySectionLabel('Administration'),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _AdminActionCard(
                        icon: Icons.people_outlined,
                        label: 'Manage Users',
                        color: DiklyColors.primary,
                        onTap: () => context.push('/admin/users'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _AdminActionCard(
                        icon: Icons.business_outlined,
                        label: 'Branches',
                        color: DiklyColors.success,
                        onTap: () => context.push('/admin/branches'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _AdminActionCard(
                        icon: Icons.history_outlined,
                        label: 'Audit Logs',
                        color: DiklyColors.warning,
                        onTap: () => context.push('/admin/audit-logs'),
                      ),
                    ),
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
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final String subtitle;
  final VoidCallback? onTap;

  const _StatCard({required this.title, required this.value, required this.icon, required this.color, required this.subtitle, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: DiklyColors.border),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 3,
              decoration: BoxDecoration(
                color: color,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(title, style: const TextStyle(fontSize: 11, color: DiklyColors.textLight, fontWeight: FontWeight.w600))),
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                          child: Icon(icon, size: 13, color: color),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1)),
                        const SizedBox(height: 3),
                        Text(subtitle, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ActionChip({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
          ],
        ),
      ),
    );
  }
}

class _SessionsPanel extends StatelessWidget {
  final List<Map<String, dynamic>> sessions;
  const _SessionsPanel({required this.sessions});

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
                onTap: () => context.push('/sessions'),
                child: const Text('View all →', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (sessions.isEmpty)
            const Text('No sessions yet', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))
          else
            ...sessions.map((s) {
              final isLive = ['active', 'live', 'paused', 'locked'].contains(s['status']);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(right: 8, top: 1),
                      decoration: BoxDecoration(
                        color: isLive ? DiklyColors.success : DiklyColors.textLight,
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
                    Text(
                      isLive ? 'Live' : 'Ended',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isLive ? DiklyColors.success : DiklyColors.textLight),
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

class _AnnouncementsPanel extends StatelessWidget {
  final List<Map<String, dynamic>> announcements;
  const _AnnouncementsPanel({required this.announcements});

  Color _typeColor(String? type) {
    switch (type) {
      case 'info': return const Color(0xFF3B82F6);
      case 'warning': return const Color(0xFFF59E0B);
      case 'success': return DiklyColors.success;
      case 'urgent': return DiklyColors.error;
      default: return DiklyColors.textLight;
    }
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
              const Expanded(child: Text('Announcements', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text))),
              GestureDetector(
                onTap: () => context.push('/announcements'),
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
            const Text('No announcements yet', style: TextStyle(fontSize: 12, color: DiklyColors.textLight))
          else
            ...announcements.map((a) {
              final dotColor = _typeColor(a['type']?.toString());
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(right: 8, top: 4),
                      decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
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

class _AdminActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _AdminActionCard({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(height: 8),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
        ],
      ),
    );
  }
}
