import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getSignInStatus());

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getMyLeaves());

final _monthlyAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getMyMonthlyAttendance());

const _accent = Color(0xFF0369A1);

class EmployeeHomeScreen extends ConsumerStatefulWidget {
  const EmployeeHomeScreen({super.key});

  @override
  ConsumerState<EmployeeHomeScreen> createState() => _EmployeeHomeScreenState();
}

class _EmployeeHomeScreenState extends ConsumerState<EmployeeHomeScreen> {
  bool _clockLoading = false;

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
          SnackBar(content: Text('Failed: ${e.toString()}'), backgroundColor: DiklyColors.error),
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
    final today = DateFormat('EEEE d MMMM').format(DateTime.now());
    final companyCode = user?.institutionCode ?? '';

    return RefreshIndicator(
      onRefresh: () async {
        ref.refresh(_signInStatusProvider);
        ref.refresh(_myLeavesProvider);
        ref.refresh(_monthlyAttendanceProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          // ── Greeting ─────────────────────────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome back, $firstName',
                      style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${companyCode.isNotEmpty ? '$companyCode · ' : ''}$today',
                      style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton.icon(
                onPressed: () => context.push('/messages'),
                icon: const Icon(Icons.message_outlined, size: 14),
                label: const Text('Message Manager', style: TextStyle(fontSize: 12)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: DiklyColors.textSecondary,
                  side: const BorderSide(color: DiklyColors.border),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // ── Clock In / Out Banner ─────────────────────────────────
          signInAsync.when(
            loading: () => _ClockBannerSkeleton(),
            error: (_, __) => _ClockBannerError(onRetry: () => ref.refresh(_signInStatusProvider)),
            data: (status) {
              final isClockedIn = status['isClockedIn'] == true;
              return _ClockBanner(
                isClockedIn: isClockedIn,
                loading: _clockLoading,
                onTap: () => _toggleClock(isClockedIn),
              );
            },
          ),
          const SizedBox(height: 16),

          // ── 4 Stat Cards ──────────────────────────────────────────
          monthlyAsync.when(
            loading: () => const _StatsSkeleton(),
            error: (_, __) => const SizedBox.shrink(),
            data: (monthly) {
              final records = (monthly['records'] as List?) ?? [];
              final presentDays = records.where((r) => r['status'] == 'present' || r['status'] == 'late').length;
              final lateDays = records.where((r) => r['status'] == 'late').length;
              final totalHrs = records.fold<double>(0, (s, r) => s + ((r['hoursWorked'] as num?)?.toDouble() ?? 0));
              final recordedDays = records.where((r) => r['clockIn']?['time'] != null).length;
              final attRate = recordedDays > 0 ? (presentDays / recordedDays * 100).round() : 0;

              return leavesAsync.when(
                loading: () => _StatsRow(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: 21),
                error: (_, __) => _StatsRow(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: 21),
                data: (leaves) {
                  final year = DateTime.now().year;
                  final annualUsed = leaves.where((l) => l['status'] == 'approved' && l['type'] == 'annual' && DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year).fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                  return _StatsRow(attRate: attRate, lateDays: lateDays, totalHrs: totalHrs, annualLeft: (21 - annualUsed).clamp(0, 21));
                },
              );
            },
          ),
          const SizedBox(height: 16),

          // ── Leave Balance + Notifications ─────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: leavesAsync.when(
                  loading: () => const _CardSkeleton(height: 140),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (leaves) {
                    final year = DateTime.now().year;
                    final yearLeaves = leaves.where((l) => l['status'] == 'approved' && DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year).toList();
                    final annualUsed = yearLeaves.where((l) => l['type'] == 'annual').fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                    final sickUsed = yearLeaves.where((l) => l['type'] == 'sick').fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
                    final annualLeft = (21 - annualUsed).clamp(0, 21);
                    final sickLeft = (10 - sickUsed).clamp(0, 10);
                    return _LeaveBalanceCard(annualLeft: annualLeft, sickLeft: sickLeft, onRequest: () => context.push('/employee/leaves'));
                  },
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(child: _NotificationsCard()),
            ],
          ),
          const SizedBox(height: 20),

          // ── Quick Actions ─────────────────────────────────────────
          Text('Quick Actions', style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _QuickChip(icon: Icons.login_outlined, label: 'Clock In / Out', onTap: () => context.push('/sign-in-out')),
                const SizedBox(width: 8),
                _QuickChip(icon: Icons.event_available_outlined, label: 'My Attendance', onTap: () => context.push('/corporate-attendance')),
                const SizedBox(width: 8),
                _QuickChip(icon: Icons.event_note_outlined, label: 'Request Leave', onTap: () => context.push('/employee/leaves')),
                const SizedBox(width: 8),
                _QuickChip(icon: Icons.access_time_outlined, label: 'My Shift', onTap: () => context.push('/employee/shift')),
                const SizedBox(width: 8),
                _QuickChip(icon: Icons.message_outlined, label: 'Message Manager', onTap: () => context.push('/messages')),
                const SizedBox(width: 8),
                _QuickChip(icon: Icons.trending_up_outlined, label: 'My Performance', onTap: () => context.push('/performance')),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ── Recent Attendance ─────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Recent Attendance', style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
              GestureDetector(
                onTap: () => context.push('/corporate-attendance'),
                child: Text('View all →', style: GoogleFonts.dmSans(fontSize: 13, color: _accent, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          monthlyAsync.when(
            loading: () => const _CardSkeleton(height: 120),
            error: (_, __) => const SizedBox.shrink(),
            data: (monthly) {
              final records = (monthly['records'] as List?) ?? [];
              final recent = records.reversed.take(5).toList();
              if (recent.isEmpty) {
                return _EmptyCard(icon: Icons.event_available_outlined, message: 'No attendance records yet');
              }
              return Container(
                decoration: BoxDecoration(
                  color: DiklyColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: DiklyColors.border),
                ),
                child: Column(
                  children: recent.asMap().entries.map((entry) {
                    final r = entry.value as Map<String, dynamic>;
                    final date = r['date']?.toString() ?? '';
                    final clockIn = r['clockIn']?['time']?.toString() ?? r['clockIn']?.toString() ?? '—';
                    final clockOut = r['clockOut']?['time']?.toString() ?? r['clockOut']?.toString() ?? '—';
                    final status = r['status']?.toString() ?? 'present';
                    Color statusColor;
                    switch (status.toLowerCase()) {
                      case 'late': statusColor = const Color(0xFFD97706); break;
                      case 'absent': statusColor = const Color(0xFFDC2626); break;
                      default: statusColor = const Color(0xFF16A34A);
                    }
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                      decoration: BoxDecoration(
                        border: entry.key < recent.length - 1 ? const Border(bottom: BorderSide(color: DiklyColors.border)) : null,
                      ),
                      child: Row(
                        children: [
                          Expanded(child: Text(date, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text))),
                          Text(clockIn, style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight)),
                          const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Text('→', style: TextStyle(color: DiklyColors.textLight))),
                          Text(clockOut, style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight)),
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                            child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: statusColor)),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Clock Banner ──────────────────────────────────────────────────────────────

class _ClockBanner extends StatelessWidget {
  final bool isClockedIn;
  final bool loading;
  final VoidCallback onTap;

  const _ClockBanner({required this.isClockedIn, required this.loading, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isClockedIn ? 'CLOCKED IN' : 'NOT STARTED',
                  style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: isClockedIn ? const Color(0xFF16A34A) : DiklyColors.textLight, letterSpacing: 0.8),
                ),
                const SizedBox(height: 4),
                Text(
                  isClockedIn ? 'You\'re clocked in' : 'Ready to clock in?',
                  style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          ElevatedButton.icon(
            onPressed: loading ? null : onTap,
            icon: loading
                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Icon(isClockedIn ? Icons.logout : Icons.login, size: 16),
            label: Text(
              loading ? 'Please wait...' : (isClockedIn ? 'Clock Out' : 'Clock In'),
              style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: isClockedIn ? DiklyColors.error : const Color(0xFF16A34A),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
          ),
        ],
      ),
    );
  }
}

class _ClockBannerSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      decoration: BoxDecoration(color: DiklyColors.border.withOpacity(0.4), borderRadius: BorderRadius.circular(14)),
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
      decoration: BoxDecoration(color: DiklyColors.error.withOpacity(0.05), borderRadius: BorderRadius.circular(14), border: Border.all(color: DiklyColors.error.withOpacity(0.2))),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 20),
          const SizedBox(width: 10),
          const Expanded(child: Text('Failed to load clock status', style: TextStyle(fontSize: 13, color: DiklyColors.textPrimary))),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

// ── Stats Row ─────────────────────────────────────────────────────────────────

class _StatsRow extends StatelessWidget {
  final int attRate;
  final int lateDays;
  final double totalHrs;
  final int annualLeft;

  const _StatsRow({required this.attRate, required this.lateDays, required this.totalHrs, required this.annualLeft});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatCard(value: '$attRate%', label: 'MONTHLY RATE', color: attRate >= 80 ? const Color(0xFF16A34A) : attRate >= 60 ? const Color(0xFFD97706) : const Color(0xFFDC2626))),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(value: '$lateDays', label: 'LATE DAYS', color: const Color(0xFFD97706))),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(value: '${totalHrs.toStringAsFixed(1)}h', label: 'HOURS THIS MONTH', color: const Color(0xFF0891B2))),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(value: '$annualLeft', label: 'ANNUAL DAYS LEFT', color: const Color(0xFF7C3AED))),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color, height: 1)),
          const SizedBox(height: 3),
          Text(label, style: const TextStyle(fontSize: 9, color: DiklyColors.textSecondary, fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _StatsSkeleton extends StatelessWidget {
  const _StatsSkeleton();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(4, (_) => Expanded(child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        height: 60,
        decoration: BoxDecoration(color: DiklyColors.border.withOpacity(0.4), borderRadius: BorderRadius.circular(10)),
      ))),
    );
  }
}

// ── Leave Balance Card ────────────────────────────────────────────────────────

class _LeaveBalanceCard extends StatelessWidget {
  final int annualLeft;
  final int sickLeft;
  final VoidCallback onRequest;

  const _LeaveBalanceCard({required this.annualLeft, required this.sickLeft, required this.onRequest});

  Color _barColor(int left, int total) =>
      left > total * 0.4 ? const Color(0xFF16A34A) : left > total * 0.2 ? const Color(0xFFD97706) : const Color(0xFFDC2626);

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
          Text('Leave Balance', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
          const SizedBox(height: 12),
          _LeaveRow(label: 'Annual Leave', left: annualLeft, total: 21, barColor: _barColor(annualLeft, 21)),
          const SizedBox(height: 10),
          _LeaveRow(label: 'Sick Leave', left: sickLeft, total: 10, barColor: _barColor(sickLeft, 10)),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: onRequest,
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: _accent.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: _accent.withOpacity(0.2)),
              ),
              child: Text('Request Leave', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w700, color: _accent)),
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
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: LinearProgressIndicator(
            value: left / total,
            backgroundColor: DiklyColors.border,
            color: barColor,
            minHeight: 5,
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
