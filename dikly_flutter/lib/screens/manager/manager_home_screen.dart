import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _managerDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getManagerDashboardData(),
);

class ManagerHomeScreen extends ConsumerWidget {
  const ManagerHomeScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashAsync = ref.watch(_managerDashProvider);
    final user = ref.watch(authProvider).user;
    final firstName = (user?.name ?? 'Manager').split(' ').first;
    final companyCode = user?.institutionCode ?? '';

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_managerDashProvider),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          // ── Greeting + Company Code ──────────────────────────────
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
                    const SizedBox(height: 3),
                    Text(
                      'Manager Portal → Dikly.co',
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              if (companyCode.isNotEmpty)
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(ClipboardData(text: companyCode));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Company code copied'), duration: Duration(seconds: 2)),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: DiklyColors.background,
                      border: Border.all(color: DiklyColors.border),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              'COMPANY CODE',
                              style: GoogleFonts.dmSans(fontSize: 9, color: DiklyColors.textLight, fontWeight: FontWeight.w600, letterSpacing: 0.6),
                            ),
                            Text(
                              companyCode,
                              style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w800, color: DiklyColors.text, letterSpacing: 1),
                            ),
                          ],
                        ),
                        const SizedBox(width: 6),
                        const Icon(Icons.copy_outlined, size: 14, color: DiklyColors.textLight),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),

          // ── Stats / Error ────────────────────────────────────────
          dashAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(40),
                child: CircularProgressIndicator(color: Color(0xFF0891B2)),
              ),
            ),
            error: (e, _) => _ErrorCard(onRetry: () => ref.invalidate(_managerDashProvider)),
            data: (data) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 5 stat cards — 2-column grid
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 1.55,
                  children: [
                    _StatCard(
                      label: 'TOTAL EMPLOYEES',
                      value: '${data['totalEmployees'] ?? 0}',
                      sub: 'Active workforce',
                      icon: Icons.people_outline,
                      iconColor: const Color(0xFF0369A1),
                    ),
                    _StatCard(
                      label: 'ACTIVE SESSIONS',
                      value: '${data['activeSessions'] ?? 0}',
                      sub: 'Currently clocked in',
                      icon: Icons.check_circle_outline,
                      iconColor: const Color(0xFF16A34A),
                    ),
                    _StatCard(
                      label: 'HOURS THIS MONTH',
                      value: '${data['hoursThisMonth'] ?? 0}',
                      sub: 'From approved timesheets',
                      icon: Icons.access_time_outlined,
                      iconColor: const Color(0xFFD97706),
                    ),
                    _StatCard(
                      label: 'LEAVE REQUESTS',
                      value: '${data['leaveRequests'] ?? 0}',
                      sub: 'Pending review',
                      icon: Icons.event_note_outlined,
                      iconColor: const Color(0xFFDC2626),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _StatCard(
                  label: 'DEPARTMENTS',
                  value: '${data['departments'] ?? 0}',
                  sub: 'Across company',
                  icon: Icons.business_outlined,
                  iconColor: const Color(0xFF0891B2),
                  fullWidth: true,
                ),
                const SizedBox(height: 24),

                // ── Quick Actions ──────────────────────────────────
                Text(
                  'QUICK ACTIONS',
                  style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textLight, letterSpacing: 1),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _QuickAction(
                        label: 'Live attendance',
                        icon: Icons.radio_button_checked,
                        color: const Color(0xFF16A34A),
                        onTap: () => context.push('/corporate-attendance'),
                      ),
                      const SizedBox(width: 8),
                      _QuickAction(
                        label: 'Add employee',
                        icon: Icons.person_add_outlined,
                        color: const Color(0xFF0369A1),
                        onTap: () => context.push('/manager/team'),
                      ),
                      const SizedBox(width: 8),
                      _QuickAction(
                        label: 'Announce',
                        icon: Icons.campaign_outlined,
                        color: const Color(0xFFD97706),
                        onTap: () => context.push('/announcements'),
                      ),
                      const SizedBox(width: 8),
                      _QuickAction(
                        label: 'Payroll',
                        icon: Icons.attach_money_outlined,
                        color: const Color(0xFF6B7280),
                        onTap: () => context.push('/expenses'),
                      ),
                      const SizedBox(width: 8),
                      _QuickAction(
                        label: 'Manage shifts',
                        icon: Icons.schedule_outlined,
                        color: const Color(0xFF0891B2),
                        onTap: () => context.push('/shifts'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // ── Recent Sessions ────────────────────────────────
                _SectionHeader(title: 'Recent Sessions', actionLabel: 'View all', onAction: () => context.push('/corporate-attendance')),
                const SizedBox(height: 10),
                _RecentSessionsCard(sessions: (data['recentSessions'] as List?) ?? []),
                const SizedBox(height: 20),

                // ── Team by Department ─────────────────────────────
                _SectionHeader(title: 'Team by Department', actionLabel: 'Manage', onAction: () => context.push('/manager/team')),
                const SizedBox(height: 10),
                _TeamByDepartmentCard(teams: (data['teams'] as List?) ?? []),
                const SizedBox(height: 20),

                // ── Team Overview ──────────────────────────────────
                _SectionHeader(title: 'Team Overview', actionLabel: 'Full roster', onAction: () => context.push('/manager/team')),
                const SizedBox(height: 10),
                _TeamOverviewCard(employees: (data['teamOverview'] as List?) ?? []),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final IconData icon;
  final Color iconColor;
  final bool fullWidth;

  const _StatCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.icon,
    required this.iconColor,
    this.fullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(label, style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textLight, letterSpacing: 0.5)),
                const SizedBox(height: 6),
                Text(value, style: GoogleFonts.dmSans(fontSize: fullWidth ? 28 : 24, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1)),
                const SizedBox(height: 4),
                Text(sub, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: iconColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 18, color: iconColor),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 6),
            Text(label, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String actionLabel;
  final VoidCallback onAction;

  const _SectionHeader({required this.title, required this.actionLabel, required this.onAction});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
        GestureDetector(
          onTap: onAction,
          child: Text('$actionLabel →', style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF0891B2), fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }
}

class _RecentSessionsCard extends StatelessWidget {
  final List sessions;

  const _RecentSessionsCard({required this.sessions});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: sessions.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('No sessions yet', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textLight)),
              ),
            )
          : Column(
              children: sessions.map<Widget>((s) {
                final name = s['employee']?['name'] ?? s['name'] ?? '—';
                final clockIn = s['clockIn']?['time']?.toString() ?? s['clockIn']?.toString() ?? '—';
                final status = s['status']?.toString() ?? 'present';
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: const Color(0xFF0891B2).withOpacity(0.12),
                        child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF0891B2))),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(name, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text), overflow: TextOverflow.ellipsis)),
                      Text(clockIn, style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight)),
                      const SizedBox(width: 8),
                      _StatusBadge(status: status),
                    ],
                  ),
                );
              }).toList(),
            ),
    );
  }
}

class _TeamByDepartmentCard extends StatelessWidget {
  final List teams;

  const _TeamByDepartmentCard({required this.teams});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: teams.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('Unassigned · 100%', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textLight)),
              ),
            )
          : Column(
              children: teams.map<Widget>((t) {
                final name = t['name']?.toString() ?? 'Unassigned';
                final count = (t['memberCount'] ?? t['members']?.length ?? 0) as int;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(child: Text(name, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text))),
                      Text('$count', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textLight)),
                    ],
                  ),
                );
              }).toList(),
            ),
    );
  }
}

class _TeamOverviewCard extends StatelessWidget {
  final List employees;

  const _TeamOverviewCard({required this.employees});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: employees.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(24),
              child: Center(child: Text('No team members yet', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textLight))),
            )
          : Column(
              children: employees.map<Widget>((e) {
                final name = e['name']?.toString() ?? e['user']?['name']?.toString() ?? '—';
                final role = e['role']?.toString() ?? e['position']?.toString() ?? 'Employee';
                final isActive = e['status']?.toString().toLowerCase() == 'active' || e['isActive'] == true;
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: const Color(0xFF0891B2).withOpacity(0.12),
                        child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF0891B2))),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text), overflow: TextOverflow.ellipsis),
                            Text(role, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight)),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: isActive ? const Color(0xFF16A34A).withOpacity(0.1) : DiklyColors.border,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          isActive ? 'Active' : 'Inactive',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isActive ? const Color(0xFF16A34A) : DiklyColors.textLight),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status.toLowerCase()) {
      case 'present': color = const Color(0xFF16A34A); break;
      case 'late': color = const Color(0xFFD97706); break;
      case 'absent': color = const Color(0xFFDC2626); break;
      default: color = DiklyColors.textLight;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
      child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorCard({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off_rounded, size: 36, color: DiklyColors.textLight),
          const SizedBox(height: 10),
          const Text('Failed to load dashboard', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0891B2), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
          ),
        ],
      ),
    );
  }
}
