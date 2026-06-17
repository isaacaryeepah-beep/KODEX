import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (ref) => apiService.getSignInStatus());

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
    (ref) => apiService.getMyLeaves());

final _monthlyAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (ref) => apiService.getMyMonthlyAttendance());

class EmployeeHomeScreen extends ConsumerStatefulWidget {
  const EmployeeHomeScreen({super.key});

  @override
  ConsumerState<EmployeeHomeScreen> createState() => _EmployeeHomeScreenState();
}

class _EmployeeHomeScreenState extends ConsumerState<EmployeeHomeScreen> {
  bool _clockLoading = false;

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  Future<void> _toggleClock(bool isClockedIn) async {
    setState(() => _clockLoading = true);
    try {
      if (isClockedIn) {
        await apiService.signOut();
      } else {
        await apiService.signIn();
      }
      ref.refresh(_signInStatusProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString()}'),
            backgroundColor: const Color(0xFFDC2626),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _clockLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user         = ref.watch(currentUserProvider);
    final signInAsync  = ref.watch(_signInStatusProvider);
    final leavesAsync  = ref.watch(_myLeavesProvider);
    final monthlyAsync = ref.watch(_monthlyAttendanceProvider);
    final firstName    = (user?.name ?? 'Employee').split(' ').first;
    final today        = DateFormat('EEEE d MMMM').format(DateTime.now());
    const theme        = DiklyRoleTheme.employee;
    final empId        = user?.indexNumber ?? '';

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async {
          ref.refresh(_signInStatusProvider);
          ref.refresh(_myLeavesProvider);
          ref.refresh(_monthlyAttendanceProvider);
        },
        color: theme.primary,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            // ── Page header (web style) ────────────────────────────────
            DiklyFadeIn(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Welcome back, $firstName',
                    style: GoogleFonts.dmSans(fontSize: 20, fontWeight: FontWeight.w800, color: DiklyColors.text),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          [
                            if (user?.company != null) user!.company!,
                            if (empId.isNotEmpty) 'ID: $empId',
                            today,
                          ].join(' · '),
                          style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => context.push('/messages'),
                        child: Text(
                          'Message Manager',
                          style: GoogleFonts.dmSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: theme.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),

            // ── Clock in/out banner ────────────────────────────────────
            signInAsync.when(
              loading: () => const DiklyShimmerCard(height: 84),
              error: (_, __) => _ClockBannerError(onRetry: () => ref.refresh(_signInStatusProvider)),
              data: (status) {
                final isClockedIn = status['isClockedIn'] == true;
                return DiklyFadeIn(
                  delay: const Duration(milliseconds: 60),
                  child: _ClockBanner(
                    isClockedIn: isClockedIn,
                    loading: _clockLoading,
                    color: theme.primary,
                    onTap: () => _toggleClock(isClockedIn),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),

            // ── Stat cards (web style: centered, no icon) ──────────────
            monthlyAsync.when(
              loading: () => const DiklyShimmerGrid(),
              error: (_, __) => const SizedBox.shrink(),
              data: (monthly) {
                final records     = (monthly['records'] as List?) ?? [];
                final presentDays = records.where((r) => r['status'] == 'present' || r['status'] == 'late').length;
                final lateDays    = records.where((r) => r['status'] == 'late').length;
                final totalHrs    = records.fold<double>(0, (s, r) => s + ((r['hoursWorked'] as num?)?.toDouble() ?? 0));
                final recordedDays = records.where((r) => r['clockIn']?['time'] != null).length;
                final attRate     = recordedDays > 0 ? (presentDays / recordedDays * 100).round() : 0;

                return leavesAsync.when(
                  loading: () => _EmpStatGrid(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: 21, theme: theme),
                  error:   (_, __) => _EmpStatGrid(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: 21, theme: theme),
                  data: (leaves) {
                    final year       = DateTime.now().year;
                    final annualUsed = leaves
                        .where((l) =>
                            l['status'] == 'approved' &&
                            l['type'] == 'annual' &&
                            DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year)
                        .fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                    return DiklyFadeIn(
                      delay: const Duration(milliseconds: 80),
                      child: _EmpStatGrid(
                        attRate: attRate,
                        lateDays: lateDays,
                        totalHrs: totalHrs,
                        annualLeft: (21 - annualUsed).clamp(0, 21),
                        theme: theme,
                      ),
                    );
                  },
                );
              },
            ),
            const SizedBox(height: 18),

            // ── Quick actions ──────────────────────────────────────────
            DiklyFadeIn(
              delay: const Duration(milliseconds: 100),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    DiklyQuickChip(icon: Icons.login_outlined,           label: 'Clock In/Out',   color: theme.primary, onTap: () => context.push('/sign-in-out')),
                    DiklyQuickChip(icon: Icons.event_available_outlined, label: 'My Attendance',  color: theme.primary, onTap: () => context.push('/corporate-attendance')),
                    DiklyQuickChip(icon: Icons.event_note_outlined,      label: 'Request Leave',  color: theme.primary, onTap: () => context.push('/employee/leaves')),
                    DiklyQuickChip(icon: Icons.access_time_outlined,     label: 'My Shift',       color: theme.primary, onTap: () => context.push('/employee/shift')),
                    DiklyQuickChip(icon: Icons.trending_up_outlined,     label: 'Performance',    color: theme.primary, onTap: () => context.push('/performance')),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 22),

            // ── Leave balance card ─────────────────────────────────────
            leavesAsync.when(
              loading: () => const DiklyShimmerCard(height: 140),
              error:   (_, __) => const SizedBox.shrink(),
              data: (leaves) {
                final year        = DateTime.now().year;
                final yearLeaves  = leaves.where((l) => l['status'] == 'approved' && DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year).toList();
                final annualUsed  = yearLeaves.where((l) => l['type'] == 'annual').fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                final sickUsed    = yearLeaves.where((l) => l['type'] == 'sick')  .fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                final annualLeft  = (21 - annualUsed).clamp(0, 21);
                final sickLeft    = (10 - sickUsed)  .clamp(0, 10);

                return DiklyFadeIn(
                  delay: const Duration(milliseconds: 120),
                  child: _LeaveBalanceCard(
                    annualLeft: annualLeft,
                    sickLeft: sickLeft,
                    color: theme.primary,
                    onRequest: () => context.push('/employee/leaves'),
                  ),
                );
              },
            ),
            const SizedBox(height: 22),

            // ── Recent attendance ──────────────────────────────────────
            DiklyFadeIn(
              delay: const Duration(milliseconds: 160),
              child: DiklySectionRow(
                title: 'Recent Attendance',
                onViewAll: () => context.push('/corporate-attendance'),
              ),
            ),
            monthlyAsync.when(
              loading: () => const DiklyShimmerList(count: 4),
              error:   (_, __) => const SizedBox.shrink(),
              data: (monthly) {
                final records = (monthly['records'] as List?) ?? [];
                final recent  = records.reversed.take(5).toList();
                if (recent.isEmpty) {
                  return const DiklyEmptyCard(icon: Icons.event_available_outlined, message: 'No attendance records yet');
                }
                return Column(
                  children: recent.map<Widget>((r) {
                    final date     = r['date']?.toString() ?? '';
                    final clockIn  = r['clockIn']?['time']?.toString() ?? r['clockIn']?.toString() ?? '—';
                    final clockOut = r['clockOut']?['time']?.toString() ?? r['clockOut']?.toString() ?? '—';
                    final status   = r['status']?.toString() ?? 'present';
                    return DiklyListTile(
                      title: date,
                      subtitle: '$clockIn  →  $clockOut',
                      accentColor: theme.primary,
                      badge: DiklyStatusPill.fromStatus(status),
                    );
                  }).toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

// ── Clock banner ──────────────────────────────────────────────────────────────

class _ClockBanner extends StatelessWidget {
  final bool isClockedIn;
  final bool loading;
  final Color color;
  final VoidCallback onTap;

  const _ClockBanner({
    required this.isClockedIn,
    required this.loading,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final activeColor = isClockedIn ? const Color(0xFFDC2626) : color;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: activeColor.withOpacity(0.25)),
        boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 6, offset: Offset(0, 2))],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: activeColor.withOpacity(0.10),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isClockedIn ? Icons.sensor_door_outlined : Icons.login_outlined,
              color: activeColor,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isClockedIn ? 'CLOCKED IN' : 'NOT STARTED',
                  style: GoogleFonts.dmSans(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: activeColor,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  isClockedIn ? "You're clocked in today" : 'Ready to clock in?',
                  style: GoogleFonts.dmSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF111827),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          ElevatedButton(
            onPressed: loading ? null : onTap,
            style: ElevatedButton.styleFrom(
              backgroundColor: activeColor,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
            child: loading
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(
                    isClockedIn ? 'Clock Out' : 'Clock In',
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700),
                  ),
          ),
        ],
      ),
    );
  }
}

class _ClockBannerError extends StatelessWidget {
  final VoidCallback onRetry;
  const _ClockBannerError({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFDC2626).withOpacity(0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 20),
          const SizedBox(width: 10),
          const Expanded(child: Text('Failed to load clock status', style: TextStyle(fontSize: 13, color: Color(0xFF374151)))),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

// ── Employee stat grid (web style — centered, no icon) ────────────────────────

class _EmpStatGrid extends StatelessWidget {
  final int attRate;
  final int lateDays;
  final double totalHrs;
  final int annualLeft;
  final DiklyRoleTheme theme;

  const _EmpStatGrid({
    required this.attRate,
    required this.lateDays,
    required this.totalHrs,
    required this.annualLeft,
    required this.theme,
  });

  Color _rateColor(int rate) {
    if (rate >= 80) return const Color(0xFF16A34A);
    if (rate >= 60) return const Color(0xFFD97706);
    return const Color(0xFFDC2626);
  }

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.4,
      children: [
        _EmpStatCard(value: '$attRate%',                  label: 'MONTHLY RATE',      color: _rateColor(attRate)),
        _EmpStatCard(value: '$lateDays',                  label: 'LATE DAYS',          color: const Color(0xFFD97706)),
        _EmpStatCard(value: '${totalHrs.toStringAsFixed(1)}h', label: 'HOURS THIS MONTH', color: theme.primary),
        _EmpStatCard(value: '$annualLeft',                label: 'ANNUAL DAYS LEFT',   color: const Color(0xFF7C3AED)),
      ],
    );
  }
}

class _EmpStatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _EmpStatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: Column(
        children: [
          Container(height: 4, color: color),
          Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    value,
                    style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: color, height: 1.1),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: const Color(0xFF6B7280), letterSpacing: 0.8),
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

// ── Leave balance card ────────────────────────────────────────────────────────

class _LeaveBalanceCard extends StatelessWidget {
  final int annualLeft;
  final int sickLeft;
  final Color color;
  final VoidCallback onRequest;

  const _LeaveBalanceCard({
    required this.annualLeft,
    required this.sickLeft,
    required this.color,
    required this.onRequest,
  });

  Color _barColor(int left, int total) {
    if (left > total * 0.4) return const Color(0xFF16A34A);
    if (left > total * 0.2) return const Color(0xFFD97706);
    return const Color(0xFFDC2626);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [BoxShadow(color: Color(0x06000000), blurRadius: 6, offset: Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                child: Icon(Icons.event_available_outlined, size: 16, color: color),
              ),
              const SizedBox(width: 10),
              Text('Leave Balance', style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
            ],
          ),
          const SizedBox(height: 16),
          _LeaveRow(label: 'Annual Leave', left: annualLeft, total: 21, barColor: _barColor(annualLeft, 21)),
          const SizedBox(height: 12),
          _LeaveRow(label: 'Sick Leave',   left: sickLeft,   total: 10, barColor: _barColor(sickLeft, 10)),
          const SizedBox(height: 14),
          GestureDetector(
            onTap: onRequest,
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: color.withOpacity(0.2)),
              ),
              child: Text('Request Leave', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaveRow extends StatelessWidget {
  final String label;
  final int left;
  final int total;
  final Color barColor;

  const _LeaveRow({required this.label, required this.left, required this.total, required this.barColor});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textSecondary)),
            Text('$left / $total days', style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.text)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: left / total,
            backgroundColor: const Color(0xFFE4E4E7),
            color: barColor,
            minHeight: 6,
          ),
        ),
      ],
    );
  }
}
