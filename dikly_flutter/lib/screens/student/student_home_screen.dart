import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _studentDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getStudentDashboardData(),
);

// ── Design tokens (web-match) ─────────────────────────────────────────────────
const _studentColor = Color(0xFF7C3AED); // purple
const _statBlue     = Color(0xFF2563EB);
const _statGreen    = Color(0xFF059669);
const _statOrange   = Color(0xFFD97706);
const _statPurple   = Color(0xFF7C3AED);

class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  static const _theme = DiklyRoleTheme.student;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_studentDashProvider);

    final isLocked = user?.deviceLocked == true &&
        user?.deviceLockedUntil != null &&
        user!.deviceLockedUntil!.isAfter(DateTime.now());
    final lockUntil = user?.deviceLockedUntil;

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_studentDashProvider),
        color: _theme.primary,
        child: dashAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: const [
              SizedBox(height: 8),
              DiklyShimmerCard(height: 72),
              SizedBox(height: 16),
              DiklyShimmerGrid(),
              SizedBox(height: 20),
              DiklyShimmerList(count: 4),
            ],
          ),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(24),
            children: [
              DiklyErrorView(
                message: e.toString().replaceAll('Exception: ', ''),
                onRetry: () => ref.invalidate(_studentDashProvider),
              ),
            ],
          ),
          data: (d) => _buildContent(context, ref, d, user, isLocked, lockUntil),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> d,
    dynamic user,
    bool isLocked,
    DateTime? lockUntil,
  ) {
    final assignments = (d['upcomingAssignments'] as List? ?? []);
    final attendance  = (d['recentAttendance']    as List? ?? []);
    final activeSession = d['activeSession'] as Map<String, dynamic>?;

    final firstName = (user?.name ?? 'Student').split(' ').first;
    final instCode  = user?.institutionCode ?? '';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        // ── Greeting row (flat white, web style) ──────────────────────
        DiklyFadeIn(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome back, $firstName',
                      style: GoogleFonts.dmSans(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: DiklyColors.text,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      user?.company ?? user?.institutionCode ?? 'Student Portal',
                      style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Device lock warning
        if (isLocked && lockUntil != null) ...[
          _DeviceLockBanner(until: lockUntil),
          const SizedBox(height: 12),
        ],

        // Active session banner
        if (activeSession != null) ...[
          DiklyFadeIn(child: _ActiveSessionBanner(session: activeSession)),
          const SizedBox(height: 16),
        ],

        // Quick actions (horizontally scrollable button row)
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _QuickBtn(label: 'Mark Attendance', color: _statBlue,   filled: true,  onTap: () => context.push('/attendance')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'View History',    color: _statBlue,   filled: false, onTap: () => context.push('/attendance')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'My Courses',      color: _statBlue,   filled: false, onTap: () => context.push('/courses')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'Quizzes',         color: _statBlue,   filled: false, onTap: () => context.push('/quizzes')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'Report Card',     color: _statBlue,   filled: false, onTap: () => context.push('/gradebook')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Stat cards — web style (centered, no icon)
        DiklyFadeIn(
          delay: const Duration(milliseconds: 100),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.4,
            children: [
              _WebStatCard(value: '${d['totalCheckIns'] ?? 0}',   label: 'TOTAL CHECK-INS',   color: _statBlue),
              _WebStatCard(value: '${d['attendanceRate'] ?? 0}%', label: 'ATTENDANCE RATE',    color: _statGreen),
              _WebStatCard(value: '${d['enrolledCourses'] ?? 0}', label: 'ENROLLED COURSES',   color: _statOrange),
              _WebStatCard(value: '${d['quizzesTaken'] ?? 0}',    label: 'QUIZZES TAKEN',      color: _statPurple),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // Upcoming assignments
        if (assignments.isNotEmpty) ...[
          DiklyFadeIn(
            delay: const Duration(milliseconds: 140),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklySectionRow(
                  title: 'Upcoming Assignments',
                  count: assignments.length,
                  onViewAll: () => context.push('/assignments'),
                ),
                ...assignments.take(3).map((a) => _assignmentTile(a)),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Recent attendance table
        DiklyFadeIn(
          delay: const Duration(milliseconds: 180),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(
                title: 'Recent Attendance',
                onViewAll: () => context.push('/attendance'),
              ),
              if (attendance.isEmpty)
                const DiklyEmptyCard(
                  icon: Icons.fact_check_outlined,
                  message: 'No attendance records yet',
                )
              else ...[
                _AttendanceTableHeader(),
                ...attendance.take(5).map((a) => _AttendanceRow(record: a)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _assignmentTile(Map<String, dynamic> a) {
    final status = (a['status'] ?? 'pending').toString().toLowerCase();
    final Color statusColor;
    if (status == 'graded')    statusColor = _statGreen;
    else if (status == 'submitted') statusColor = _statBlue;
    else statusColor = _statOrange;

    return DiklyListTile(
      title: a['title'] ?? 'Assignment',
      subtitle: a['course'] ?? '',
      accentColor: statusColor,
      badge: DiklyStatusPill(label: status, color: statusColor),
      leadingIcon: Icons.assignment_outlined,
    );
  }
}

// ── Page header ───────────────────────────────────────────────────────────────

class _PageHeader extends StatelessWidget {
  final String name;
  final String subtitle;
  const _PageHeader({required this.name, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Welcome back, $name',
          style: GoogleFonts.dmSans(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: DiklyColors.text,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          subtitle,
          style: GoogleFonts.dmSans(
            fontSize: 13,
            color: DiklyColors.textMuted,
          ),
        ),
      ],
    );
  }
}

// ── Web-style centered stat card (no icon) ────────────────────────────────────

class _WebStatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _WebStatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [
          BoxShadow(color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 1)),
        ],
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
                    style: GoogleFonts.dmSans(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: color,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.dmSans(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF6B7280),
                      letterSpacing: 0.8,
                    ),
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

// ── Quick action button ───────────────────────────────────────────────────────

class _QuickBtn extends StatelessWidget {
  final String label;
  final Color color;
  final bool filled;
  final VoidCallback onTap;

  const _QuickBtn({
    required this.label,
    required this.color,
    required this.filled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: filled ? color : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: filled ? color : const Color(0xFFD1D5DB)),
        ),
        child: Text(
          label,
          style: GoogleFonts.dmSans(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: filled ? Colors.white : DiklyColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

// ── Attendance table header / row ─────────────────────────────────────────────

class _AttendanceTableHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: const BoxDecoration(
        color: Color(0xFFF9FAFB),
        border: Border(
          top: BorderSide(color: Color(0xFFE5E7EB)),
          left: BorderSide(color: Color(0xFFE5E7EB)),
          right: BorderSide(color: Color(0xFFE5E7EB)),
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
      ),
      child: Row(
        children: [
          Expanded(flex: 3, child: _TH('SESSION')),
          Expanded(flex: 2, child: _TH('STATUS')),
          Expanded(flex: 2, child: _TH('CHECK-IN TIME')),
        ],
      ),
    );
  }
}

class _TH extends StatelessWidget {
  final String text;
  const _TH(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: GoogleFonts.dmSans(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: const Color(0xFF6B7280),
        letterSpacing: 0.5,
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;
  const _AttendanceRow({required this.record});

  @override
  Widget build(BuildContext context) {
    final status    = (record['status'] ?? '').toString().toLowerCase();
    final session   = record['session'] ?? record['sessionTitle'] ?? 'Session';
    final checkIn   = record['checkInTime'] ?? record['date'] ?? '—';

    final Color statusColor;
    if (status == 'present')   statusColor = const Color(0xFF059669);
    else if (status == 'late') statusColor = const Color(0xFFD97706);
    else                       statusColor = const Color(0xFFDC2626);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          left: BorderSide(color: Color(0xFFE5E7EB)),
          right: BorderSide(color: Color(0xFFE5E7EB)),
          bottom: BorderSide(color: Color(0xFFE5E7EB)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              session.toString(),
              style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(
            flex: 2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.10),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                status.isNotEmpty ? status[0].toUpperCase() + status.substring(1) : '—',
                style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor),
              ),
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              checkIn.toString(),
              style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Device lock banner ────────────────────────────────────────────────────────

class _DeviceLockBanner extends StatelessWidget {
  final DateTime until;
  const _DeviceLockBanner({required this.until});

  @override
  Widget build(BuildContext context) {
    final remaining = until.difference(DateTime.now());
    final hours = remaining.inHours;
    final mins  = remaining.inMinutes % 60;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFCD34D)),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock_outline_rounded, color: Color(0xFFD97706), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'New device detected. Quiz/meeting access unlocks in ${hours}h ${mins}m.',
              style: GoogleFonts.dmSans(fontSize: 12, color: const Color(0xFF92400E), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Active session banner ─────────────────────────────────────────────────────

class _ActiveSessionBanner extends StatelessWidget {
  final Map<String, dynamic> session;
  const _ActiveSessionBanner({required this.session});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/attendance'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [_studentColor, _studentColor.withOpacity(0.8)]),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: _studentColor.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(
          children: [
            _LiveDot(),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Session Active', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white70)),
                  Text(session['title'] ?? 'Active Session', style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
              child: Text('Mark Now', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }
}

class _LiveDot extends StatefulWidget {
  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _anim,
      child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
    );
  }
}
