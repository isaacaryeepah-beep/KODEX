import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../widgets/ds/dikly_ds.dart';
import '../../widgets/ds/home_widgets.dart';
import '../../core/theme.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (ref) => apiService.getSignInStatus());

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
    (ref) => apiService.getMyLeaves());

final _monthlyAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
    (ref) => apiService.getMyMonthlyAttendance());

const _accent = Color(0xFF0369A1);

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
    final user = ref.watch(currentUserProvider);
    final signInAsync = ref.watch(_signInStatusProvider);
    final leavesAsync = ref.watch(_myLeavesProvider);
    final monthlyAsync = ref.watch(_monthlyAttendanceProvider);
    final firstName = (user?.name ?? 'Employee').split(' ').first;
    final today = DateFormat('EEEE, d MMMM').format(DateTime.now());
    const theme = DiklyRoleTheme.employee;

    return Column(
      children: [
          DiklyHeroSection(
            gradient: theme.gradient,
            greeting: '${_greeting()}, $firstName',
            subtitle: today,
            stats: const [
              DiklyHeaderStat(value: '—', label: 'Monthly Rate', icon: Icons.trending_up),
              DiklyHeaderStat(value: '—', label: 'Hours', icon: Icons.access_time_outlined),
              DiklyHeaderStat(value: '—', label: 'Leave Left', icon: Icons.event_available_outlined),
            ],
          ),
          DiklyPageBody(
            child: RefreshIndicator(
              onRefresh: () async {
                ref.refresh(_signInStatusProvider);
                ref.refresh(_myLeavesProvider);
                ref.refresh(_monthlyAttendanceProvider);
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
                children: [
                  // Clock in/out banner
                  signInAsync.when(
                    loading: () => const DiklyShimmerCard(height: 80),
                    error: (_, __) => _ClockBannerError(
                      onRetry: () => ref.refresh(_signInStatusProvider),
                    ),
                    data: (status) {
                      final isClockedIn = status['isClockedIn'] == true;
                      return _ClockBanner(
                        isClockedIn: isClockedIn,
                        loading: _clockLoading,
                        color: theme.primary,
                        onTap: () => _toggleClock(isClockedIn),
                      );
                    },
                  ),
                  const SizedBox(height: 16),

                  // Stat cards
                  monthlyAsync.when(
                    loading: () => const DiklyShimmerGrid(),
                    error: (_, __) => const SizedBox.shrink(),
                    data: (monthly) {
                      final records = (monthly['records'] as List?) ?? [];
                      final presentDays = records.where((r) => r['status'] == 'present' || r['status'] == 'late').length;
                      final lateDays = records.where((r) => r['status'] == 'late').length;
                      final totalHrs = records.fold<double>(0, (s, r) => s + ((r['hoursWorked'] as num?)?.toDouble() ?? 0));
                      final recordedDays = records.where((r) => r['clockIn']?['time'] != null).length;
                      final attRate = recordedDays > 0 ? (presentDays / recordedDays * 100).round() : 0;

                      return leavesAsync.when(
                        loading: () => _StatGrid(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: 21, theme: theme),
                        error: (_, __) => _StatGrid(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: 21, theme: theme),
                        data: (leaves) {
                          final year = DateTime.now().year;
                          final annualUsed = leaves
                              .where((l) =>
                                  l['status'] == 'approved' &&
                                  l['type'] == 'annual' &&
                                  DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year)
                              .fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                          return _StatGrid(
                            attRate: attRate,
                            lateDays: lateDays,
                            totalHrs: totalHrs,
                            annualLeft: (21 - annualUsed).clamp(0, 21),
                            theme: theme,
                          );
                        },
                      );
                    },
                  ),
                  const SizedBox(height: 20),

                  // Quick actions
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        DiklyQuickChip(
                          icon: Icons.login_outlined,
                          label: 'Clock In / Out',
                          color: theme.primary,
                          onTap: () => context.push('/sign-in-out'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.event_available_outlined,
                          label: 'My Attendance',
                          color: theme.primary,
                          onTap: () => context.push('/corporate-attendance'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.event_note_outlined,
                          label: 'Request Leave',
                          color: theme.primary,
                          onTap: () => context.push('/employee/leaves'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.access_time_outlined,
                          label: 'My Shift',
                          color: theme.primary,
                          onTap: () => context.push('/employee/shift'),
                        ),
                        DiklyQuickChip(
                          icon: Icons.trending_up_outlined,
                          label: 'Performance',
                          color: theme.primary,
                          onTap: () => context.push('/performance'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Leave balance
                  leavesAsync.when(
                    loading: () => const DiklyShimmerCard(height: 140),
                    error: (_, __) => const SizedBox.shrink(),
                    data: (leaves) {
                      final year = DateTime.now().year;
                      final yearLeaves = leaves
                          .where((l) =>
                              l['status'] == 'approved' &&
                              DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year)
                          .toList();
                      final annualUsed = yearLeaves
                          .where((l) => l['type'] == 'annual')
                          .fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                      final sickUsed = yearLeaves
                          .where((l) => l['type'] == 'sick')
                          .fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                      final annualLeft = (21 - annualUsed).clamp(0, 21);
                      final sickLeft = (10 - sickUsed).clamp(0, 10);

                      return _LeaveBalanceCard(
                        annualLeft: annualLeft,
                        sickLeft: sickLeft,
                        color: theme.primary,
                        onRequest: () => context.push('/employee/leaves'),
                      );
                    },
                  ),
                  const SizedBox(height: 24),

                  // Recent attendance
                  DiklySectionRow(
                    title: 'Recent Attendance',
                    onViewAll: () => context.push('/corporate-attendance'),
                  ),
                  monthlyAsync.when(
                    loading: () => const DiklyShimmerList(count: 4),
                    error: (_, __) => const SizedBox.shrink(),
                    data: (monthly) {
                      final records = (monthly['records'] as List?) ?? [];
                      final recent = records.reversed.take(5).toList();
                      if (recent.isEmpty) {
                        return DiklyEmptyCard(
                          icon: Icons.event_available_outlined,
                          message: 'No attendance records yet',
                        );
                      }
                      return Column(
                        children: recent.map<Widget>((r) {
                          final date = r['date']?.toString() ?? '';
                          final clockIn = r['clockIn']?['time']?.toString() ?? r['clockIn']?.toString() ?? '—';
                          final clockOut = r['clockOut']?['time']?.toString() ?? r['clockOut']?.toString() ?? '—';
                          final status = r['status']?.toString() ?? 'present';
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
          ),
        ],
    );
  }
}

// ── Clock Banner ───────────────────────────────────────────────────────────────

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
        gradient: LinearGradient(
          colors: [activeColor.withOpacity(0.06), activeColor.withOpacity(0.02)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: activeColor.withOpacity(0.25)),
        color: Colors.white,
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
                  isClockedIn ? 'You\'re clocked in today' : 'Ready to start your day?',
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
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
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
          const Expanded(
            child: Text(
              'Failed to load clock status',
              style: TextStyle(fontSize: 13, color: Color(0xFF374151)),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

// ── Stat Grid ──────────────────────────────────────────────────────────────────

class _StatGrid extends StatelessWidget {
  final int attRate;
  final int lateDays;
  final double totalHrs;
  final int annualLeft;
  final DiklyRoleTheme theme;

  const _StatGrid({
    required this.attRate,
    required this.lateDays,
    required this.totalHrs,
    required this.annualLeft,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.35,
      children: [
        WebStatCard(
          value: '$attRate%',
          label: 'Monthly Rate',
          subtitle: attRate >= 80 ? 'Good standing' : 'Needs improvement',
          icon: Icons.trending_up,
          color: attRate >= 80
              ? const Color(0xFF16A34A)
              : attRate >= 60
                  ? const Color(0xFFD97706)
                  : const Color(0xFFDC2626),
        ),
        WebStatCard(
          value: '$lateDays',
          label: 'Late Days',
          subtitle: lateDays == 0 ? 'Perfect record' : 'This month',
          icon: Icons.watch_later_outlined,
          color: const Color(0xFFD97706),
        ),
        WebStatCard(
          value: '${totalHrs.toStringAsFixed(1)}h',
          label: 'Hours This Month',
          subtitle: 'Tracked time',
          icon: Icons.access_time_outlined,
          color: theme.primary,
        ),
        WebStatCard(
          value: '$annualLeft',
          label: 'Annual Days Left',
          subtitle: 'Remaining balance',
          icon: Icons.event_available_outlined,
          color: const Color(0xFF7C3AED),
        ),
      ],
    );
  }
}

// ── Leave Balance Card ─────────────────────────────────────────────────────────

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
        border: Border.all(color: const Color(0xFFE4E4E7)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.event_available_outlined, size: 16, color: color),
              ),
              const SizedBox(width: 10),
              Text(
                'Leave Balance',
                style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: const Color(0xFF111827)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _LeaveRow(label: 'Annual Leave', left: annualLeft, total: 21, barColor: _barColor(annualLeft, 21)),
          const SizedBox(height: 12),
          _LeaveRow(label: 'Sick Leave', left: sickLeft, total: 10, barColor: _barColor(sickLeft, 10)),
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
              child: Text(
                'Request Leave',
                style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: color),
              ),
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

// ── Notifications Card ────────────────────────────────────────────────────────

class _NotificationsCard extends StatelessWidget {
  const _NotificationsCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Notifications', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.check_circle_outline, size: 16, color: Color(0xFF16A34A)),
              const SizedBox(width: 6),
              Expanded(child: Text('All clear — no alerts', style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textSecondary))),
            ],
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => context.push('/announcements'),
            child: Text('View All →', style: GoogleFonts.dmSans(fontSize: 12, color: _accent, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

// ── Quick Action Chip ─────────────────────────────────────────────────────────

class _QuickChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickChip({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: _accent.withOpacity(0.07),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _accent.withOpacity(0.18)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: _accent),
            const SizedBox(width: 5),
            Text(label, style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: _accent)),
          ],
        ),
      ),
    );
  }
}

// ── Misc Helpers ──────────────────────────────────────────────────────────────

class _CardSkeleton extends StatelessWidget {
  final double height;
  const _CardSkeleton({required this.height});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(color: DiklyColors.border.withOpacity(0.4), borderRadius: BorderRadius.circular(12)),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final IconData icon;
  final String message;
  const _EmptyCard({required this.icon, required this.message});

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
        children: [
          Icon(icon, size: 36, color: DiklyColors.border),
          const SizedBox(height: 8),
          Text(message, style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 13)),
        ],
      ),
    );
  }
}
