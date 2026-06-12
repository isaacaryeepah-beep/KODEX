import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getSignInStatus());

final _myShiftProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getMyShift());

final _myLeavesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getMyLeaves());

final _monthlyAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getMyMonthlyAttendance());

class EmployeeHomeScreen extends ConsumerStatefulWidget {
  const EmployeeHomeScreen({super.key});

  @override
  ConsumerState<EmployeeHomeScreen> createState() => _EmployeeHomeScreenState();
}

class _EmployeeHomeScreenState extends ConsumerState<EmployeeHomeScreen> {
  bool _clockLoading = false;

  static const _accent = Color(0xFF0369A1);

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
    final shiftAsync = ref.watch(_myShiftProvider);
    final leavesAsync = ref.watch(_myLeavesProvider);
    final monthlyAsync = ref.watch(_monthlyAttendanceProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.refresh(_signInStatusProvider);
        ref.refresh(_myShiftProvider);
        ref.refresh(_myLeavesProvider);
        ref.refresh(_monthlyAttendanceProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _GreetingRow(name: user?.name ?? 'Employee'),
          const SizedBox(height: 16),
          // Clock In / Out Card
          signInAsync.when(
            loading: () => const _ClockCardSkeleton(),
            error: (e, _) => _ClockCardError(
              onRetry: () => ref.refresh(_signInStatusProvider),
            ),
            data: (status) => _ClockCard(
              isClockedIn: status['isClockedIn'] == true,
              lastClockIn: status['lastClockIn']?.toString(),
              lastClockOut: status['lastClockOut']?.toString(),
              todayHours: status['todayHours']?.toString() ?? '0',
              loading: _clockLoading,
              onTap: () => _toggleClock(status['isClockedIn'] == true),
            ),
          ),
          const SizedBox(height: 20),
          // Monthly stats + leave balance
          monthlyAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (monthly) {
              final records = monthly['records'] as List;
              final presentDays = records.where((r) => r['status'] == 'present' || r['status'] == 'late').length;
              final lateDays = records.where((r) => r['status'] == 'late').length;
              final totalHrs = records.fold<double>(0, (s, r) => s + ((r['hoursWorked'] as num?)?.toDouble() ?? 0));
              final recordedDays = records.where((r) => r['clockIn']?['time'] != null).length;
              final attRate = recordedDays > 0 ? (presentDays / recordedDays * 100).round() : 0;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 4,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 0.9,
                    children: [
                      _MonthStat(value: '$attRate%', label: 'Monthly Rate', color: attRate >= 80 ? const Color(0xFF16A34A) : attRate >= 60 ? const Color(0xFFD97706) : const Color(0xFFDC2626)),
                      _MonthStat(value: '$lateDays', label: 'Late Days', color: const Color(0xFFD97706)),
                      _MonthStat(value: '${totalHrs.toStringAsFixed(1)}h', label: 'Hours', color: const Color(0xFF0891B2)),
                      _MonthStat(value: '—', label: 'Days Left', color: const Color(0xFF7C3AED)),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
              );
            },
          ),
          // Leave balance (from leaves data)
          leavesAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (leaves) {
              final year = DateTime.now().year;
              final yearLeaves = leaves.where((l) => l['status'] == 'approved' && DateTime.tryParse(l['startDate']?.toString() ?? '')?.year == year).toList();
              final annualUsed = yearLeaves.where((l) => l['type'] == 'annual').fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
              final sickUsed = yearLeaves.where((l) => l['type'] == 'sick').fold<int>(0, (s, l) => s + ((l['days'] as num?)?.toInt() ?? 0));
              const annualTotal = 21;
              const sickTotal = 10;
              final annualLeft = (annualTotal - annualUsed).clamp(0, annualTotal);
              final sickLeft = (sickTotal - sickUsed).clamp(0, sickTotal);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Leave Balance', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: DiklyColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Column(
                      children: [
                        _LeaveBalanceRow(label: 'Annual Leave', used: annualUsed, total: annualTotal, left: annualLeft),
                        const SizedBox(height: 12),
                        _LeaveBalanceRow(label: 'Sick Leave', used: sickUsed, total: sickTotal, left: sickLeft),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              );
            },
          ),
          // My Shift Summary
          const Text(
            'My Shift',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          shiftAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
            error: (e, _) => _ErrorCard(
              message: 'Could not load shift info',
              onRetry: () => ref.refresh(_myShiftProvider),
            ),
            data: (shift) => _ShiftSummaryCard(shift: shift),
          ),
          const SizedBox(height: 20),
          // Recent Leave Requests
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
                return const _EmptyLeaveCard();
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
    );
  }
}

class _GreetingRow extends StatelessWidget {
  final String name;
  const _GreetingRow({required this.name});

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _greeting,
                style: const TextStyle(
                  fontSize: 13,
                  color: DiklyColors.textSecondary,
                ),
              ),
              Text(
                name.split(' ').first,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF0369A1).withOpacity(0.08),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.work_outline, size: 14, color: Color(0xFF0369A1)),
              const SizedBox(width: 4),
              Text(
                'My Workspace',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF0369A1),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ClockCard extends StatelessWidget {
  final bool isClockedIn;
  final String? lastClockIn;
  final String? lastClockOut;
  final String todayHours;
  final bool loading;
  final VoidCallback onTap;

  const _ClockCard({
    required this.isClockedIn,
    required this.lastClockIn,
    required this.lastClockOut,
    required this.todayHours,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final buttonColor = isClockedIn ? DiklyColors.success : const Color(0xFF0369A1);
    final statusLabel = isClockedIn ? 'Clocked In' : 'Not Clocked In';
    final statusColor = isClockedIn ? DiklyColors.success : DiklyColors.textSecondary;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: DiklyColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                ),
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
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Today\'s Hours',
                      style: TextStyle(
                        fontSize: 12,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                    Text(
                      '${todayHours}h',
                      style: const TextStyle(
                        fontSize: 32,
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
                    const Text(
                      'Last Clock In',
                      style: TextStyle(fontSize: 11, color: DiklyColors.textSecondary),
                    ),
                    Text(
                      lastClockIn!,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],
                  if (lastClockOut != null) ...[
                    const Text(
                      'Last Clock Out',
                      style: TextStyle(fontSize: 11, color: DiklyColors.textSecondary),
                    ),
                    Text(
                      lastClockOut!,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: buttonColor,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
              onPressed: loading ? null : onTap,
              icon: loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(
                      isClockedIn ? Icons.logout : Icons.login,
                      size: 20,
                    ),
              label: Text(
                loading
                    ? 'Please wait...'
                    : isClockedIn
                        ? 'Clock Out'
                        : 'Clock In',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClockCardSkeleton extends StatelessWidget {
  const _ClockCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: DiklyColors.border.withOpacity(0.5),
        borderRadius: BorderRadius.circular(16),
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
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: DiklyColors.error.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: DiklyColors.error.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 24),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Failed to load clock status',
              style: TextStyle(color: DiklyColors.textPrimary, fontSize: 14),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _ShiftSummaryCard extends StatelessWidget {
  final Map<String, dynamic> shift;
  const _ShiftSummaryCard({required this.shift});

  @override
  Widget build(BuildContext context) {
    final name = shift['shiftName']?.toString() ?? 'N/A';
    final startTime = shift['startTime']?.toString() ?? '--:--';
    final endTime = shift['endTime']?.toString() ?? '--:--';
    final days = shift['days'] as List? ?? [];
    final location = shift['location']?.toString();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0369A1), Color(0xFF0284C7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.schedule, color: Colors.white70, size: 16),
              const SizedBox(width: 6),
              Text(
                name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _TimeChip(label: startTime),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.arrow_forward, color: Colors.white70, size: 16),
              ),
              _TimeChip(label: endTime),
              const Spacer(),
              if (location != null)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.location_on_outlined, color: Colors.white70, size: 14),
                    const SizedBox(width: 4),
                    Text(
                      location,
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
            ],
          ),
          if (days.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              children: days.map((d) {
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    d.toString().length > 3 ? d.toString().substring(0, 3) : d.toString(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }
}

class _TimeChip extends StatelessWidget {
  final String label;
  const _TimeChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

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

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
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
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: _typeColor(type),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$startDate → $endDate',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                if (reason.isNotEmpty)
                  Text(
                    reason,
                    style: const TextStyle(
                      fontSize: 11,
                      color: DiklyColors.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _statusColor(status).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              status.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: _statusColor(status),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyLeaveCard extends StatelessWidget {
  const _EmptyLeaveCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: const Column(
        children: [
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
}

class _ErrorCard extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorCard({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.error.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.error.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 13,
                color: DiklyColors.textPrimary,
              ),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _MonthStat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _MonthStat({required this.value, required this.label, required this.color});

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
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color, height: 1)),
          Text(label, style: const TextStyle(fontSize: 9, color: DiklyColors.textSecondary, fontWeight: FontWeight.w600), maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _LeaveBalanceRow extends StatelessWidget {
  final String label;
  final int used;
  final int total;
  final int left;

  const _LeaveBalanceRow({required this.label, required this.used, required this.total, required this.left});

  Color get _barColor => left > total * 0.4 ? const Color(0xFF16A34A) : left > total * 0.2 ? const Color(0xFFD97706) : const Color(0xFFDC2626);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: DiklyColors.textPrimary))),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Row(
              children: [
                Text('$left', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _barColor)),
                Text(' / $total days', style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
              ],
            ),
            const SizedBox(height: 4),
            SizedBox(
              width: 80,
              height: 4,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: LinearProgressIndicator(
                  value: left / total,
                  backgroundColor: DiklyColors.border,
                  color: _barColor,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
