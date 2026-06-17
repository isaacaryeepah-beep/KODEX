import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _signInStatusProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) =>
    apiService.getSignInStatus());

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
    final dateLabel = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Clock In / Clock Out'),
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.refresh(_signInStatusProvider);
          ref.refresh(_myAttendanceTodayProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Track your daily attendance · $dateLabel',
              style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
            ),
            const SizedBox(height: 16),

            // ── Attendance Trust Score card ──────────────────────────────
            ref.watch(_signInStatusProvider).when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (status) {
                final score = (status['trustScore'] as num?)?.toInt() ?? 100;
                final scoreLabel = score >= 80 ? 'Excellent'
                    : score >= 60 ? 'Good'
                    : score >= 40 ? 'Fair'
                    : 'Low';
                final scoreColor = score >= 80 ? const Color(0xFF059669)
                    : score >= 60 ? const Color(0xFF2563EB)
                    : score >= 40 ? const Color(0xFFD97706)
                    : const Color(0xFFDC2626);

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ATTENDANCE TRUST SCORE',
                          style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.6)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text('$score',
                              style: GoogleFonts.dmSans(fontSize: 32, fontWeight: FontWeight.w800, color: scoreColor)),
                          const SizedBox(width: 8),
                          Text(scoreLabel,
                              style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: scoreColor)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('Below 50 = manager review · Below 20 = tracked',
                          style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
                    ],
                  ),
                );
              },
            ),

            // ── Clock status card ────────────────────────────────────────
            ref.watch(_signInStatusProvider).when(
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: CircularProgressIndicator(),
                ),
              ),
              error: (e, _) => _ErrorCard(
                message: 'Failed to load clock status',
                onRetry: () => ref.refresh(_signInStatusProvider),
              ),
              data: (status) {
                final isClockedIn = status['isClockedIn'] == true;
                final lastClockIn = status['lastClockIn']?.toString();
                final lastClockOut = status['lastClockOut']?.toString();

                return Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Column(
                    children: [
                      Icon(
                        isClockedIn ? Icons.check_box : Icons.check_box_outline_blank,
                        size: 48,
                        color: isClockedIn ? const Color(0xFF059669) : DiklyColors.textMuted,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        isClockedIn ? 'Clocked In' : 'Not Clocked In',
                        style: GoogleFonts.dmSans(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: isClockedIn ? const Color(0xFF059669) : DiklyColors.text,
                        ),
                      ),
                      if (isClockedIn && lastClockIn != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Since ${_fmtTime(lastClockIn)}',
                          style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                        ),
                      ] else if (!isClockedIn && lastClockOut != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Last out: ${_fmtTime(lastClockOut)}',
                          style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                        ),
                      ],
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: _clockLoading ? null : () => _toggleClock(isClockedIn),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: isClockedIn ? const Color(0xFFDC2626) : const Color(0xFF059669),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            elevation: 0,
                          ),
                          icon: _clockLoading
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : Icon(isClockedIn ? Icons.logout : Icons.login, size: 20),
                          label: Text(
                            _clockLoading ? 'Processing...' : isClockedIn ? 'Clock Out' : 'Clock In',
                            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 20),

            // ── Today's Log ──────────────────────────────────────────────
            Text('Today\'s Log',
                style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
            const SizedBox(height: 10),
            ref.watch(_myAttendanceTodayProvider).when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator(strokeWidth: 2))),
              error: (_, __) => const SizedBox.shrink(),
              data: (records) {
                final today = DateTime.now();
                final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
                final todayRecords = records.where((r) {
                  final date = r['date']?.toString() ?? '';
                  return date.contains(todayStr);
                }).toList();

                if (todayRecords.isEmpty) {
                  return Container(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Center(
                      child: Text('No records for today yet.',
                          style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                    ),
                  );
                }

                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Column(
                    children: todayRecords.map((r) => _AttendanceRow(record: r)).toList(),
                  ),
                );
              },
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  String _fmtTime(String raw) {
    try {
      return DateFormat('h:mm a').format(DateTime.parse(raw).toLocal());
    } catch (_) {
      return raw;
    }
  }
}

class _AttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;
  const _AttendanceRow({required this.record});

  String _fmtTime(dynamic t) {
    if (t == null) return '—';
    try {
      return DateFormat('h:mm a').format(DateTime.parse(t.toString()).toLocal());
    } catch (_) {
      return t.toString();
    }
  }

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'present': return const Color(0xFF059669);
      case 'late': return const Color(0xFFD97706);
      case 'absent': return const Color(0xFFDC2626);
      default: return const Color(0xFF6B7280);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = record['status']?.toString() ?? 'present';
    final clockIn = _fmtTime(record['clockIn']?['time'] ?? record['clockIn']);
    final clockOut = _fmtTime(record['clockOut']?['time'] ?? record['clockOut']);
    final hours = (record['hoursWorked'] as num?)?.toDouble() ?? 0;
    final color = _statusColor(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Row(
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 12),
          Expanded(
            child: Text('$clockIn → $clockOut',
                style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.text)),
          ),
          Text('${hours.toStringAsFixed(1)}h',
              style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
            child: Text(status.toUpperCase(),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
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
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.error.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: DiklyColors.error, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(fontSize: 13))),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
