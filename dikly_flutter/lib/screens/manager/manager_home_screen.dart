import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../widgets/ds/dikly_ds.dart';
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

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_managerDashProvider),
        color: theme.primary,
        child: dashAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SizedBox(height: 12),
              _Greeting(greeting: _greeting(), firstName: firstName, companyCode: companyCode),
              const SizedBox(height: 16),
              const DiklyShimmerGrid(),
              const SizedBox(height: 20),
              const DiklyShimmerList(count: 3),
            ],
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [_ErrorCard(onRetry: () => ref.invalidate(_managerDashProvider))],
          ),
          data: (data) => _buildContent(context, ref, data, firstName, companyCode, theme),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, Map<String, dynamic> data, String firstName, String companyCode, DiklyRoleTheme theme) {
    final sessions = (data['recentSessions'] as List?) ?? [];
    final teams = (data['teams'] as List?) ?? [];
    final employees = (data['teamOverview'] as List?) ?? [];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        DiklyFadeIn(child: _Greeting(greeting: _greeting(), firstName: firstName, companyCode: companyCode)),
        const SizedBox(height: 18),

        // Stats 2×2
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [
              _BStat(value: '${data['totalEmployees'] ?? 0}', title: 'TOTAL EMPLOYEES', subtitle: 'All staff', icon: Icons.people_outline, color: theme.primary),
              _BStat(value: '${data['activeSessions'] ?? 0}', title: 'ACTIVE SESSIONS', subtitle: 'Live now', icon: Icons.check_circle_outline, color: const Color(0xFF059669)),
              _BStat(value: '${data['hoursThisMonth'] ?? 0}', title: 'HOURS THIS MONTH', subtitle: 'Team total', icon: Icons.access_time_outlined, color: const Color(0xFFD97706)),
              _BStat(value: '${data['leaveRequests'] ?? 0}', title: 'LEAVE REQUESTS', subtitle: 'Pending review', icon: Icons.event_note_outlined, color: const Color(0xFFDC2626)),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Quick actions
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
                DiklyQuickChip(icon: Icons.radio_button_checked, label: 'Live Attendance', color: theme.primary, onTap: () => context.push('/corporate-attendance')),
                DiklyQuickChip(icon: Icons.person_add_outlined, label: 'Add Employee', color: theme.primary, onTap: () => context.push('/manager/team')),
                DiklyQuickChip(icon: Icons.campaign_outlined, label: 'Announce', color: theme.primary, onTap: () => context.push('/announcements')),
                DiklyQuickChip(icon: Icons.schedule_outlined, label: 'Manage Shifts', color: theme.primary, onTap: () => context.push('/shifts')),
                DiklyQuickChip(icon: Icons.attach_money_outlined, label: 'Payroll', color: theme.primary, onTap: () => context.push('/expenses')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),

        // Recent sessions
        DiklyFadeIn(
          delay: const Duration(milliseconds: 140),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(title: 'Recent Sessions', count: sessions.length, onViewAll: () => context.push('/corporate-attendance')),
              if (sessions.isEmpty)
                const DiklyEmptyCard(icon: Icons.people_outline, message: 'No recent sessions')
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
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Team by department
        DiklyFadeIn(
          delay: const Duration(milliseconds: 160),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(title: 'Team by Department', onViewAll: () => context.push('/manager/team')),
              if (teams.isEmpty)
                const DiklyEmptyCard(icon: Icons.business_outlined, message: 'No departments set up yet')
              else
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
                  ),
                  child: Column(
                    children: teams.asMap().entries.map<Widget>((e) {
                      final t = e.value as Map<String, dynamic>;
                      final deptName = t['name']?.toString() ?? 'Unassigned';
                      final count = (t['memberCount'] ?? t['members']?.length ?? 0) as int;
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          border: e.key < teams.length - 1 ? const Border(bottom: BorderSide(color: Color(0xFFE5E7EB))) : null,
                        ),
                        child: Row(
                          children: [
                            Container(width: 8, height: 8, decoration: BoxDecoration(color: theme.primary, shape: BoxShape.circle)),
                            const SizedBox(width: 10),
                            Expanded(child: Text(deptName, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: const Color(0xFF111827)))),
                            Text('$count members', style: GoogleFonts.dmSans(fontSize: 12, color: const Color(0xFF6B7280))),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Team overview
        DiklyFadeIn(
          delay: const Duration(milliseconds: 180),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(title: 'Team Overview', count: employees.length, viewAllLabel: 'Full roster', onViewAll: () => context.push('/manager/team')),
              if (employees.isEmpty)
                const DiklyEmptyCard(icon: Icons.group_outlined, message: 'No team members yet')
              else
                ...employees.take(5).map<Widget>((e) {
                  final name = e['name']?.toString() ?? e['user']?['name']?.toString() ?? '—';
                  final role = e['role']?.toString() ?? e['position']?.toString() ?? 'Employee';
                  final isActive = e['status']?.toString().toLowerCase() == 'active' || e['isActive'] == true;
                  return DiklyListTile(
                    title: name,
                    subtitle: role,
                    accentColor: theme.primary,
                    badge: DiklyStatusPill(label: isActive ? 'Active' : 'Inactive', color: isActive ? const Color(0xFF16A34A) : const Color(0xFF6B7280)),
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }
}

class _Greeting extends StatelessWidget {
  final String greeting;
  final String firstName;
  final String companyCode;
  const _Greeting({required this.greeting, required this.firstName, required this.companyCode});

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
        Text('Manager Portal · Dikly', style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF6B7280))),
        if (companyCode.isNotEmpty) ...[
          const SizedBox(height: 12),
          _CodeRow(code: companyCode),
        ],
      ],
    );
  }
}

class _CodeRow extends StatelessWidget {
  final String code;
  const _CodeRow({required this.code});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Text('COMPANY CODE', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.2)),
          const SizedBox(width: 10),
          Text(code, style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w800, color: const Color(0xFF111827), letterSpacing: 1)),
          const Spacer(),
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: code));
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Code copied'), duration: Duration(seconds: 2)));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(border: Border.all(color: const Color(0xFFD1D5DB)), borderRadius: BorderRadius.circular(7)),
              child: Text('Copy', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: const Color(0xFF374151))),
            ),
          ),
        ],
      ),
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

class _ErrorCard extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorCard({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE5E7EB))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off_rounded, size: 36, color: Color(0xFF9CA3AF)),
          const SizedBox(height: 10),
          Text('Failed to load dashboard', style: GoogleFonts.dmSans(fontWeight: FontWeight.w600, color: const Color(0xFF374151))),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1D4ED8),
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
