import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _studentDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getStudentDashboardData(),
);

class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_studentDashProvider);
    final firstName = (user?.name ?? 'Student').split(' ').first;

    // Device lock banner data (derived from user object directly)
    final isLocked = user?.deviceLocked == true &&
        user?.deviceLockedUntil != null &&
        user!.deviceLockedUntil!.isAfter(DateTime.now());
    final lockUntil = user?.deviceLockedUntil;

    return RefreshIndicator(
      onRefresh: () async { ref.invalidate(_studentDashProvider); },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()}, $firstName',
                      style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
                    ),
                    const SizedBox(height: 4),
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textLight),
                        children: [
                          TextSpan(text: user?.company ?? 'Your institution'),
                          if (user?.indexNumber != null && user!.indexNumber!.isNotEmpty)
                            TextSpan(text: ' · ${user.indexNumber}'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Device lock banner
          if (isLocked && lockUntil != null) ...[
            Builder(builder: (_) {
              final remaining = lockUntil.difference(DateTime.now());
              final hrs = remaining.inHours;
              final mins = remaining.inMinutes % 60;
              final timeStr = hrs > 0 ? '${hrs}h ${mins}m' : '${mins}m';
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  border: Border.all(color: const Color(0xFFF59E0B), width: 1.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('🔒', style: TextStyle(fontSize: 20)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Account Temporarily Locked — New Device Detected', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF92400E), fontSize: 13)),
                          const SizedBox(height: 4),
                          Text(
                            'Attendance, quizzes and meetings are blocked for $timeStr (until ${lockUntil.hour.toString().padLeft(2, '0')}:${lockUntil.minute.toString().padLeft(2, '0')}). Contact your admin or HOD to unlock early.',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF78350F)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 16),
          ],

          dashAsync.when(
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: DiklyColors.primary))),
            error: (e, _) => DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 36, color: DiklyColors.error),
                  const SizedBox(height: 10),
                  const Text('Failed to load dashboard'),
                  const SizedBox(height: 10),
                  TextButton(onPressed: () => ref.invalidate(_studentDashProvider), child: const Text('Retry')),
                ],
              ),
            ),
            data: (dash) {
              final activeSession = dash['activeSession'] as Map?;
              final totalCheckins = dash['totalCheckins'] ?? 0;
              final attendanceRate = dash['attendanceRate'] ?? 0;
              final enrolledCourses = dash['enrolledCourses'] ?? 0;
              final quizzesTaken = dash['quizzesTaken'] ?? 0;
              final upcomingAssignments = (dash['upcomingAssignments'] as List?) ?? [];
              final attendanceRecords = (dash['attendanceRecords'] as List?) ?? [];

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Active session banner
                  if (activeSession != null) ...[
                    GestureDetector(
                      onTap: () => context.push('/attendance'),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          border: Border.all(color: DiklyColors.success, width: 1.5),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(color: DiklyColors.success, borderRadius: BorderRadius.circular(10)),
                              child: const Icon(Icons.task_alt, color: Colors.white, size: 22),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Active Session — Mark Now', style: TextStyle(fontSize: 11, color: DiklyColors.success, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                                  const SizedBox(height: 2),
                                  Text(
                                    activeSession['title']?.toString() ?? 'Untitled Session',
                                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(color: DiklyColors.success, borderRadius: BorderRadius.circular(20)),
                              child: const Text('LIVE', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Stats grid: Total Check-ins, Attendance Rate, Enrolled Courses, Quizzes Taken
                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.55,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      _StatCard(value: '$totalCheckins', label: 'Total Check-ins', color: DiklyColors.primary),
                      _StatCard(value: '$attendanceRate%', label: 'Attendance Rate', color: (attendanceRate as int) >= 75 ? DiklyColors.success : DiklyColors.warning),
                      _StatCard(value: '$enrolledCourses', label: 'Enrolled Courses', color: const Color(0xFF7C3AED)),
                      _StatCard(value: '$quizzesTaken', label: 'Quizzes Taken', color: const Color(0xFF0891B2)),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Quick Actions
                  const Text('Quick Actions', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(child: _QAButton(label: 'Mark Attendance', icon: Icons.fingerprint, color: DiklyColors.primary, onTap: () => context.push('/attendance'))),
                      const SizedBox(width: 8),
                      Expanded(child: _QAButton(label: 'My Courses', icon: Icons.book_outlined, color: const Color(0xFF7C3AED), onTap: () => context.push('/courses'))),
                      const SizedBox(width: 8),
                      Expanded(child: _QAButton(label: 'Quizzes', icon: Icons.quiz_outlined, color: const Color(0xFF0891B2), onTap: () => context.push('/quizzes'))),
                      const SizedBox(width: 8),
                      Expanded(child: _QAButton(label: 'Timetable', icon: Icons.calendar_today_outlined, color: const Color(0xFF0D9488), onTap: () => context.push('/timetable'))),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Upcoming Assignments
                  if (upcomingAssignments.isNotEmpty) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Upcoming Assignments', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                        TextButton(onPressed: () => context.push('/assignments'), child: const Text('View All', style: TextStyle(fontSize: 13, color: DiklyColors.primary))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    DiklyCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: upcomingAssignments.take(5).map<Widget>((a) => _AssignmentRow(a: a as Map)).toList(),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Recent Attendance
                  const Text('Recent Attendance', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                  const SizedBox(height: 8),
                  attendanceRecords.isEmpty
                      ? DiklyEmptyState(
                          icon: Icons.fingerprint,
                          title: 'No attendance records yet',
                          subtitle: 'Mark attendance when a session is active.',
                        )
                      : DiklyCard(
                          padding: EdgeInsets.zero,
                          child: Column(
                            children: attendanceRecords.take(5).map<Widget>((r) => _AttendanceRow(r: r as Map)).toList(),
                          ),
                        ),
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
        ],
      ),
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
    return DiklyCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(value, style: GoogleFonts.dmSans(fontSize: 28, fontWeight: FontWeight.w800, color: color, height: 1)),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: DiklyColors.textLight, letterSpacing: 0.3)),
        ],
      ),
    );
  }
}

class _QAButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _QAButton({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: DiklyCard(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: color.withOpacity(0.12), shape: BoxShape.circle),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 7),
            Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.text), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

class _AssignmentRow extends StatelessWidget {
  final Map a;
  const _AssignmentRow({required this.a});

  @override
  Widget build(BuildContext context) {
    final dueDate = a['dueDate'] != null ? DateTime.tryParse(a['dueDate'].toString()) : null;
    final hoursLeft = dueDate != null ? dueDate.difference(DateTime.now()).inHours : null;
    final daysLeft = hoursLeft != null ? (hoursLeft / 24).floor() : null;

    Color urgencyColor;
    String timeLabel;
    if (hoursLeft == null) {
      urgencyColor = DiklyColors.textLight;
      timeLabel = '';
    } else if (hoursLeft <= 24) {
      urgencyColor = DiklyColors.error;
      timeLabel = hoursLeft >= 1 ? '${hoursLeft}h left' : 'Due soon';
    } else if (hoursLeft <= 48) {
      urgencyColor = DiklyColors.warning;
      timeLabel = '${daysLeft}d left';
    } else {
      urgencyColor = DiklyColors.textLight;
      timeLabel = '${daysLeft}d left';
    }

    final submission = a['submission'] as Map?;
    final subStatus = submission?['status']?.toString();
    String badgeText;
    Color badgeColor;
    if (subStatus == 'graded') { badgeText = 'Graded'; badgeColor = DiklyColors.success; }
    else if (subStatus != null) { badgeText = 'Submitted'; badgeColor = DiklyColors.primary; }
    else { badgeText = 'Pending'; badgeColor = DiklyColors.warning; }

    final courseMap = a['course'] as Map?;
    final courseText = [courseMap?['code'], courseMap?['title']].where((s) => s != null && s.toString().isNotEmpty).join(' ');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(a['title']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (courseText.isNotEmpty)
                  Text(courseText, style: const TextStyle(fontSize: 12, color: DiklyColors.textLight)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: badgeColor.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
            child: Text(badgeText, style: TextStyle(fontSize: 11, color: badgeColor, fontWeight: FontWeight.w600)),
          ),
          if (timeLabel.isNotEmpty) ...[
            const SizedBox(width: 6),
            Text(timeLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: urgencyColor)),
          ],
        ],
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  final Map r;
  const _AttendanceRow({required this.r});

  static const _methodLabels = {'qr_mark': 'QR Code', 'code_mark': 'Code', 'ble_mark': 'BLE', 'jitsi_join': 'Meeting', 'manual': 'Manual', 'qr': 'QR Code', 'ble': 'BLE'};

  @override
  Widget build(BuildContext context) {
    final status = r['status']?.toString() ?? '';
    final method = r['method']?.toString() ?? '';
    final methodLabel = _methodLabels[method] ?? method;
    final checkIn = r['checkInTime'] != null ? DateTime.tryParse(r['checkInTime'].toString()) : null;
    final statusColor = status == 'present' ? DiklyColors.success : status == 'late' ? DiklyColors.warning : DiklyColors.error;
    final sessionTitle = (r['session'] as Map?)?['title']?.toString() ?? 'Session';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sessionTitle, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (checkIn != null)
                  Text(DateFormat('MMM d · h:mm a').format(checkIn), style: const TextStyle(fontSize: 12, color: DiklyColors.textLight)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
                child: Text(status.toUpperCase(), style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 2),
              Text(methodLabel, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
            ],
          ),
        ],
      ),
    );
  }
}
