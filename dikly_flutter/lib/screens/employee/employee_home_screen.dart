import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getSignInStatus());

final _myShiftProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getMyShift());

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getMyLeaves());

class EmployeeHomeScreen extends ConsumerStatefulWidget {
  const EmployeeHomeScreen({super.key});

  @override
  ConsumerState<EmployeeHomeScreen> createState() => _EmployeeHomeScreenState();
}

class _EmployeeHomeScreenState extends ConsumerState<EmployeeHomeScreen> {
  bool _clockLoading = false;

  static const _accent = Color(0xFF16A34A);

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
            backgroundColor: DiklyColors.error,
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

    final firstName = (user?.name ?? 'Employee').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.refresh(_signInStatusProvider);
          ref.refresh(_myShiftProvider);
          ref.refresh(_myLeavesProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Greeting header
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome back, $firstName',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Employee Portal',
                        style: const TextStyle(
                          fontSize: 13,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (deptBadge.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      deptBadge,
                      style: const TextStyle(
                        color: Color(0xFFD97706),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 16),

            // Clock In/Out Card
            signInAsync.when(
              loading: () => _ClockCardSkeleton(),
              error: (e, _) => _ClockCardError(
                onRetry: () => ref.refresh(_signInStatusProvider),
              ),
              data: (status) {
                final isClockedIn = status['isClockedIn'] == true;
                final lastClockIn = status['lastClockIn']?.toString();
                final lastClockOut = status['lastClockOut']?.toString();
                final todayHours = status['todayHours']?.toString() ?? '0';
                final weekHours = status['weekHours']?.toString() ?? '0';

                return _ClockCard(
                  isClockedIn: isClockedIn,
                  lastClockIn: lastClockIn,
                  lastClockOut: lastClockOut,
                  todayHours: todayHours,
                  weekHours: weekHours,
                  loading: _clockLoading,
                  onTap: () => _toggleClock(isClockedIn),
                );
              },
            ),
            const SizedBox(height: 20),

            // Stats row
            signInAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (status) {
                final todayHours = status['todayHours']?.toString() ?? '0';
                final weekHours = status['weekHours']?.toString() ?? '0';
                return leavesAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (leaves) {
                    final remaining = leaves.where((l) => l['status'] == 'approved').length;
                    return Row(
                      children: [
                        Expanded(child: _MiniStat(label: 'Hours Today', value: '${todayHours}h', color: _accent)),
                        const SizedBox(width: 10),
                        Expanded(child: _MiniStat(label: 'Hours Week', value: '${weekHours}h', color: DiklyColors.primary)),
                        const SizedBox(width: 10),
                        Expanded(child: _MiniStat(label: 'Leaves Left', value: '$remaining', color: DiklyColors.warning)),
                      ],
                    );
                  },
                );
              },
            ),
            const SizedBox(height: 20),

            // Recent activity
            const Text(
              'Recent Leave Requests',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            leavesAsync.when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (e, _) => _ErrorCard(
                message: 'Could not load leave requests',
                onRetry: () => ref.refresh(_myLeavesProvider),
              ),
              data: (leaves) {
                if (leaves.isEmpty) {
                  return DiklyCard(
                    child: Column(
                      children: const [
                        Icon(Icons.event_available_outlined, size: 40, color: DiklyColors.border),
                        SizedBox(height: 8),
                        Text(
                          'No leave requests yet',
                          style: TextStyle(color: DiklyColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  );
                }
                final recent = leaves.take(3).toList();
                return Column(
                  children: recent.map((l) => _LeaveRequestRow(leave: l)).toList(),
                );
              },
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }
}

// ── Clock Card ──────────────────────────────────────────────────────────────

class _ClockCard extends StatelessWidget {
  final bool isClockedIn;
  final String? lastClockIn;
  final String? lastClockOut;
  final String todayHours;
  final String weekHours;
  final bool loading;
  final VoidCallback onTap;

  const _ClockCard({
    required this.isClockedIn,
    required this.lastClockIn,
    required this.lastClockOut,
    required this.todayHours,
    required this.weekHours,
    required this.loading,
    required this.onTap,
  });

  static const _accent = Color(0xFF16A34A);

  @override
  Widget build(BuildContext context) {
    final buttonColor = isClockedIn ? DiklyColors.error : _accent;
    final statusLabel = isClockedIn ? 'Clocked In' : 'Not Clocked In';
    final statusColor = isClockedIn ? _accent : DiklyColors.textSecondary;

    return DiklyCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status indicator
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                statusLabel,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: statusColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Large time display + timestamps
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      "Today's Hours",
                      style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                    ),
                    Text(
                      '${todayHours}h',
                      style: const TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w800,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (lastClockIn != null) ...[
                    const Text('Last Clock In', style: TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                    Text(lastClockIn!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.textPrimary)),
                    const SizedBox(height: 6),
                  ],
                  if (lastClockOut != null) ...[
                    const Text('Last Clock Out', style: TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                    Text(lastClockOut!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.textPrimary)),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Big Clock In / Clock Out button
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: buttonColor,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: loading ? null : onTap,
              icon: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Icon(isClockedIn ? Icons.logout : Icons.login, size: 20),
              label: Text(
                loading ? 'Please wait...' : isClockedIn ? 'Clock Out' : 'Clock In',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClockCardSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: DiklyColors.border.withOpacity(0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
    );
  }
}

class _ClockCardError extends StatelessWidget {
  final VoidCallback onRetry;
  const _ClockCardError({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 24),
          const SizedBox(width: 12),
          const Expanded(
            child: Text('Failed to load clock status', style: TextStyle(color: DiklyColors.textPrimary, fontSize: 14)),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

// ── Mini Stat ────────────────────────────────────────────────────────────────

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _MiniStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: DiklyColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

// ── Leave Request Row ────────────────────────────────────────────────────────

class _LeaveRequestRow extends StatelessWidget {
  final Map<String, dynamic> leave;
  const _LeaveRequestRow({required this.leave});

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'approved': return DiklyColors.success;
      case 'rejected': return DiklyColors.error;
      default: return DiklyColors.warning;
    }
  }

  Color _typeColor(String type) {
    switch (type.toLowerCase()) {
      case 'annual leave':
      case 'annual': return DiklyColors.primary;
      case 'sick leave':
      case 'sick': return DiklyColors.error;
      case 'emergency': return DiklyColors.warning;
      default: return DiklyColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = leave['type']?.toString() ?? 'Leave';
    final startDate = leave['startDate']?.toString() ?? '';
    final endDate = leave['endDate']?.toString() ?? '';
    final status = leave['status']?.toString() ?? 'pending';
    final reason = leave['reason']?.toString() ?? '';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: _typeColor(type).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              type,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _typeColor(type)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$startDate → $endDate',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.textPrimary),
                ),
                if (reason.isNotEmpty)
                  Text(
                    reason,
                    style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          DiklyBadge(label: status.toUpperCase(), color: _statusColor(status)),
        ],
      ),
    );
  }
}

// ── Error Card ────────────────────────────────────────────────────────────────

class _ErrorCard extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorCard({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, style: const TextStyle(fontSize: 13, color: DiklyColors.textPrimary)),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
