import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getSignInStatus());

final _corporateAttendanceProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getCorporateAttendance());

final _myAttendanceTodayProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) =>
    apiService.getMyAttendance());

class SignInOutScreen extends ConsumerStatefulWidget {
  const SignInOutScreen({super.key});

  @override
  ConsumerState<SignInOutScreen> createState() => _SignInOutScreenState();
}

class _SignInOutScreenState extends ConsumerState<SignInOutScreen> {
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
      ref.refresh(_myAttendanceTodayProvider);
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
    final isManager = user?.role == 'manager';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Sign In / Out'),
        backgroundColor: DiklyColors.surface,
      ),
      body: isManager ? _ManagerView(ref: ref) : _EmployeeView(
        ref: ref,
        clockLoading: _clockLoading,
        onToggle: _toggleClock,
      ),
    );
  }
}

// ─── Employee View ─────────────────────────────────────────────────────────────

class _EmployeeView extends StatelessWidget {
  final WidgetRef ref;
  final bool clockLoading;
  final Future<void> Function(bool) onToggle;

  const _EmployeeView({
    required this.ref,
    required this.clockLoading,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final signInAsync = ref.watch(_signInStatusProvider);
    final attendanceAsync = ref.watch(_myAttendanceTodayProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.refresh(_signInStatusProvider);
        ref.refresh(_myAttendanceTodayProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          signInAsync.when(
            loading: () => const SizedBox(
              height: 180,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => _ErrorCard(
              message: 'Failed to load clock status',
              onRetry: () => ref.refresh(_signInStatusProvider),
            ),
            data: (status) {
              final isClockedIn = status['isClockedIn'] == true;
              final lastClockIn = status['lastClockIn']?.toString();
              final lastClockOut = status['lastClockOut']?.toString();
              final todayHours = status['todayHours']?.toString() ?? '0';
              final buttonColor = isClockedIn ? DiklyColors.success : const Color(0xFF0369A1);

              return Container(
                padding: const EdgeInsets.all(24),
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
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color: isClockedIn ? DiklyColors.success : DiklyColors.textSecondary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          isClockedIn ? 'Currently Clocked In' : 'Not Clocked In',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: isClockedIn ? DiklyColors.success : DiklyColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Text(
                      '${todayHours}h',
                      style: const TextStyle(
                        fontSize: 48,
                        fontWeight: FontWeight.w900,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                    const Text(
                      'Today\'s Hours',
                      style: TextStyle(
                        fontSize: 13,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (lastClockIn != null || lastClockOut != null)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (lastClockIn != null)
                            _InfoPill(label: 'In', value: lastClockIn, color: DiklyColors.success),
                          if (lastClockIn != null && lastClockOut != null)
                            const SizedBox(width: 12),
                          if (lastClockOut != null)
                            _InfoPill(label: 'Out', value: lastClockOut, color: DiklyColors.error),
                        ],
                      ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: buttonColor,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                        onPressed: clockLoading ? null : () => onToggle(isClockedIn),
                        icon: clockLoading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : Icon(
                                isClockedIn ? Icons.logout : Icons.login,
                                size: 22,
                              ),
                        label: Text(
                          clockLoading
                              ? 'Processing...'
                              : isClockedIn
                                  ? 'Clock Out'
                                  : 'Clock In',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          const Text(
            'Today\'s Log',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          attendanceAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
            error: (e, _) => _ErrorCard(
              message: 'Failed to load today\'s log',
              onRetry: () => ref.refresh(_myAttendanceTodayProvider),
            ),
            data: (records) {
              if (records.isEmpty) {
                return const _EmptyState(message: 'No attendance records today');
              }
              final today = DateTime.now();
              final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
              final todayRecords = records.where((r) {
                final date = r['date']?.toString() ?? '';
                return date.contains(todayStr) || date == todayStr;
              }).toList();

              if (todayRecords.isEmpty) {
                return const _EmptyState(message: 'No records for today yet');
              }

              return Column(
                children: todayRecords.map((r) => _AttendanceRow(record: r)).toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _InfoPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _InfoPill({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label: ',
            style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500),
          ),
          Text(
            value,
            style: TextStyle(fontSize: 13, color: color, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;
  const _AttendanceRow({required this.record});

  @override
  Widget build(BuildContext context) {
    final clockIn = record['clockIn']?.toString() ?? '--:--';
    final clockOut = record['clockOut']?.toString() ?? '--:--';
    final hours = record['hoursWorked']?.toString() ?? '0';
    final status = record['status']?.toString() ?? 'present';

    Color statusColor;
    switch (status.toLowerCase()) {
      case 'present': statusColor = DiklyColors.success; break;
      case 'absent': statusColor = DiklyColors.error; break;
      case 'late': statusColor = DiklyColors.warning; break;
      default: statusColor = DiklyColors.textSecondary;
    }

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
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              status == 'present' ? Icons.check_circle_outline : Icons.access_time,
              color: statusColor,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Clock In: $clockIn',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                Text(
                  'Clock Out: $clockOut',
                  style: const TextStyle(
                    fontSize: 12,
                    color: DiklyColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  status.toUpperCase(),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${hours}h',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Manager View ──────────────────────────────────────────────────────────────

class _ManagerView extends StatelessWidget {
  final WidgetRef ref;
  const _ManagerView({required this.ref});

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_corporateAttendanceProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.refresh(_corporateAttendanceProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load team attendance'),
              TextButton(
                onPressed: () => ref.refresh(_corporateAttendanceProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (records) {
          if (records.isEmpty) {
            return const _EmptyState(message: 'No employee records found');
          }

          final clockedIn = records.where((r) => r['isClockedIn'] == true).length;
          final absent = records.where((r) => r['status']?.toString() == 'absent').length;
          final notStarted = records.length - clockedIn - absent;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _TeamSummaryBar(
                total: records.length,
                clockedIn: clockedIn,
                absent: absent,
                notStarted: notStarted,
              ),
              const SizedBox(height: 20),
              const Text(
                'Team Status',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              ...records.map((r) => _EmployeeStatusRow(record: r)),
            ],
          );
        },
      ),
    );
  }
}

class _TeamSummaryBar extends StatelessWidget {
  final int total;
  final int clockedIn;
  final int absent;
  final int notStarted;

  const _TeamSummaryBar({
    required this.total,
    required this.clockedIn,
    required this.absent,
    required this.notStarted,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0369A1), Color(0xFF2563EB)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _SummaryStatChip(label: 'Total', value: total.toString(), color: Colors.white),
          _SummaryStatChip(label: 'Clocked In', value: clockedIn.toString(), color: const Color(0xFF86EFAC)),
          _SummaryStatChip(label: 'Absent', value: absent.toString(), color: const Color(0xFFFCA5A5)),
          _SummaryStatChip(label: 'Not Started', value: notStarted.toString(), color: const Color(0xFFFDE68A)),
        ],
      ),
    );
  }
}

class _SummaryStatChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SummaryStatChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 22,
            fontWeight: FontWeight.w800,
          ),
        ),
        Text(
          label,
          style: const TextStyle(color: Colors.white70, fontSize: 11),
        ),
      ],
    );
  }
}

class _EmployeeStatusRow extends StatelessWidget {
  final Map<String, dynamic> record;
  const _EmployeeStatusRow({required this.record});

  @override
  Widget build(BuildContext context) {
    final name = record['name']?.toString() ?? record['employeeName']?.toString() ?? 'Employee';
    final isClockedIn = record['isClockedIn'] == true;
    final status = record['status']?.toString() ?? (isClockedIn ? 'clocked_in' : 'not_started');
    final clockInTime = record['clockInTime']?.toString() ?? record['lastClockIn']?.toString();

    Color statusColor;
    String statusLabel;
    switch (status.toLowerCase()) {
      case 'clocked_in':
      case 'present':
        statusColor = DiklyColors.success;
        statusLabel = 'Clocked In';
        break;
      case 'absent':
        statusColor = DiklyColors.error;
        statusLabel = 'Absent';
        break;
      default:
        statusColor = DiklyColors.textSecondary;
        statusLabel = 'Not Started';
    }
    if (isClockedIn) {
      statusColor = DiklyColors.success;
      statusLabel = 'Clocked In';
    }

    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').take(2).map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').join()
        : 'E';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: const Color(0xFF0369A1).withOpacity(0.12),
            child: Text(
              initials,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0369A1),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                if (clockInTime != null)
                  Text(
                    'Clocked in at $clockInTime',
                    style: const TextStyle(
                      fontSize: 12,
                      color: DiklyColors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Shared Helpers ────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final String message;
  const _EmptyState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inbox_outlined, size: 48, color: DiklyColors.border),
          const SizedBox(height: 12),
          Text(message, style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 14)),
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
              style: const TextStyle(fontSize: 13, color: DiklyColors.textPrimary),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
