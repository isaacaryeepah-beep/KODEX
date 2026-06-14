import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../widgets/ds/home_widgets.dart';
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
    const theme = DiklyRoleTheme.manager;

    return Column(
      children: [
          DiklyHeroSection(
            gradient: theme.gradient,
            greeting: '${_greeting()}, $firstName',
            subtitle: 'Manager Portal · Dikly',
            badge: companyCode.isNotEmpty ? _CompanyCodeBadge(code: companyCode) : null,
            stats: const [
              DiklyHeaderStat(value: '—', label: 'Employees', icon: Icons.people_outline),
              DiklyHeaderStat(value: '—', label: 'Active Now', icon: Icons.check_circle_outline),
              DiklyHeaderStat(value: '—', label: 'Leave Pending', icon: Icons.event_note_outlined),
            ],
          ),
          DiklyPageBody(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(_managerDashProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
                children: [
                  // Quick actions
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        DiklyQuickChip(
                          icon: Icons.radio_button_checked,
                          label: 'Live Attendance',
                          color: theme.primary,
                          onTap: () => context.push('/corporate-attendance'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.person_add_outlined,
                          label: 'Add Employee',
                          color: theme.primary,
                          onTap: () => context.push('/manager/team'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.campaign_outlined,
                          label: 'Announce',
                          color: theme.primary,
                          onTap: () => context.push('/announcements'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.schedule_outlined,
                          label: 'Manage Shifts',
                          color: theme.primary,
                          onTap: () => context.push('/shifts'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.attach_money_outlined,
                          label: 'Payroll',
                          color: theme.primary,
                          onTap: () => context.push('/expenses'),
                        ),
                      ],
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

                  dashAsync.when(
                    loading: () => const Column(
                      children: [
                        DiklyShimmerGrid(),
                        SizedBox(height: 20),
                        DiklyShimmerList(count: 3),
                      ],
                    ),
                    error: (e, _) => _ErrorCard(
                      onRetry: () => ref.invalidate(_managerDashProvider),
                    ),
                    data: (data) {
                      final sessions = (data['recentSessions'] as List?) ?? [];
                      final teams = (data['teams'] as List?) ?? [];
                      final employees = (data['teamOverview'] as List?) ?? [];

                      return DiklyFadeIn(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // 2×2 Stat grid
                            GridView.count(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              crossAxisCount: 2,
                              crossAxisSpacing: 10,
                              mainAxisSpacing: 10,
                              childAspectRatio: 1.6,
                              children: [
                                DiklyGradientStat(
                                  value: '${data['totalEmployees'] ?? 0}',
                                  label: 'Total Employees',
                                  icon: Icons.people_outline,
                                  color: theme.primary,
                                ),
                                DiklyGradientStat(
                                  value: '${data['activeSessions'] ?? 0}',
                                  label: 'Active Sessions',
                                  icon: Icons.check_circle_outline,
                                  color: const Color(0xFF16A34A),
                                ),
                                DiklyGradientStat(
                                  value: '${data['hoursThisMonth'] ?? 0}',
                                  label: 'Hours This Month',
                                  icon: Icons.access_time_outlined,
                                  color: const Color(0xFFD97706),
                                ),
                                DiklyGradientStat(
                                  value: '${data['leaveRequests'] ?? 0}',
                                  label: 'Leave Requests',
                                  icon: Icons.event_note_outlined,
                                  color: const Color(0xFFDC2626),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),

                            // Recent sessions
                            DiklySectionRow(
                              title: 'Recent Sessions',
                              count: sessions.length,
                              onViewAll: () => context.push('/corporate-attendance'),
                            ),
                            if (sessions.isEmpty)
                              DiklyEmptyCard(
                                icon: Icons.people_outline,
                                message: 'No recent sessions',
                              )
                            else
                              ...sessions.map<Widget>((s) {
                                final name = s['employee']?['name'] ?? s['name'] ?? '—';
                                final clockIn = s['clockIn']?['time']?.toString() ?? s['clockIn']?.toString() ?? '—';
                                final status = s['status']?.toString() ?? 'present';
                                return DiklyListTile(
                                  title: name,
                                  subtitle: 'Clocked in at $clockIn',
                                  accentColor: theme.primary,
                                  badge: DiklyStatusPill.fromStatus(status),
                                );
                              }),

                            const SizedBox(height: 20),

                            // Team by department
                            DiklySectionRow(
                              title: 'Team by Department',
                              onViewAll: () => context.push('/manager/team'),
                            ),
                            if (teams.isEmpty)
                              DiklyEmptyCard(
                                icon: Icons.business_outlined,
                                message: 'No departments set up yet',
                              )
                            else
                              Container(
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: const Color(0xFFE4E4E7)),
                                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))],
                                ),
                                child: Column(
                                  children: teams.asMap().entries.map<Widget>((e) {
                                    final t = e.value as Map<String, dynamic>;
                                    final deptName = t['name']?.toString() ?? 'Unassigned';
                                    final count = (t['memberCount'] ?? t['members']?.length ?? 0) as int;
                                    return Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                      decoration: BoxDecoration(
                                        border: e.key < teams.length - 1
                                            ? const Border(bottom: BorderSide(color: Color(0xFFE4E4E7)))
                                            : null,
                                      ),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 8,
                                            height: 8,
                                            decoration: BoxDecoration(
                                              color: theme.primary,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              deptName,
                                              style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: const Color(0xFF111827)),
                                            ),
                                          ),
                                          Text(
                                            '$count members',
                                            style: GoogleFonts.dmSans(fontSize: 12, color: const Color(0xFF6B7280)),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),

                            const SizedBox(height: 20),

                            // Team overview
                            DiklySectionRow(
                              title: 'Team Overview',
                              count: employees.length,
                              viewAllLabel: 'Full roster',
                              onViewAll: () => context.push('/manager/team'),
                            ),
                            if (employees.isEmpty)
                              DiklyEmptyCard(
                                icon: Icons.group_outlined,
                                message: 'No team members yet',
                              )
                            else
                              ...employees.take(5).map<Widget>((e) {
                                final name = e['name']?.toString() ?? e['user']?['name']?.toString() ?? '—';
                                final role = e['role']?.toString() ?? e['position']?.toString() ?? 'Employee';
                                final isActive = e['status']?.toString().toLowerCase() == 'active' || e['isActive'] == true;
                                return DiklyListTile(
                                  title: name,
                                  subtitle: role,
                                  accentColor: theme.primary,
                                  badge: DiklyStatusPill(
                                    label: isActive ? 'Active' : 'Inactive',
                                    color: isActive ? const Color(0xFF16A34A) : const Color(0xFF6B7280),
                                  ),
                                );
                              }),
                          ],
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE4E4E7)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off_rounded, size: 36, color: Color(0xFF9CA3AF)),
          const SizedBox(height: 10),
          Text(
            'Failed to load dashboard',
            style: GoogleFonts.dmSans(fontWeight: FontWeight.w600, color: const Color(0xFF374151)),
          ),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0891B2),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              elevation: 0,
            ),
          ),
        ],
      ),
    );
  }
}

class _CompanyCodeBadge extends StatelessWidget {
  final String code;
  const _CompanyCodeBadge({required this.code});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: code));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Company code copied'), duration: Duration(seconds: 2)),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.18),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.white.withOpacity(0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              code,
              style: GoogleFonts.dmSans(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.copy_outlined, size: 12, color: Colors.white70),
          ],
        ),
      ),
    );
  }
}
