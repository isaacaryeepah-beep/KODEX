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

  static const _theme = DiklyRoleTheme.student;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_studentDashProvider);
    final firstName = (user?.name ?? 'Student').split(' ').first;

    final isLocked = user?.deviceLocked == true &&
        user?.deviceLockedUntil != null &&
        user!.deviceLockedUntil!.isAfter(DateTime.now());
    final lockUntil = user?.deviceLockedUntil;

    return Column(
      children: [
          // ── Hero ─────────────────────────────────────────────────
          dashAsync.when(
            data: (d) => DiklyHeroSection(
              gradient: _theme.gradient,
              greeting: 'Hi, $firstName 👋',
              subtitle: '${user?.institution ?? 'Student Portal'} · ${DateFormat('EEE, MMM d').format(DateTime.now())}',
              stats: [
                DiklyHeaderStat(
                  value: '${d['totalCheckIns'] ?? 0}',
                  label: 'Check-ins',
                  icon: Icons.fact_check_outlined,
                ),
                DiklyHeaderStat(
                  value: '${d['attendanceRate'] ?? 0}%',
                  label: 'Attendance',
                  icon: Icons.trending_up_rounded,
                ),
                DiklyHeaderStat(
                  value: '${d['enrolledCourses'] ?? 0}',
                  label: 'Courses',
                  icon: Icons.school_outlined,
                ),
              ],
            ),
            loading: () => DiklyHeroSection(
              gradient: _theme.gradient,
              greeting: 'Hi, $firstName 👋',
              subtitle: user?.institution ?? 'Student Portal',
              stats: [
                const DiklyHeaderStat(value: '—', label: 'Check-ins'),
                const DiklyHeaderStat(value: '—', label: 'Attendance'),
                const DiklyHeaderStat(value: '—', label: 'Courses'),
              ],
            ),
            error: (_, __) => DiklyHeroSection(
              gradient: _theme.gradient,
              greeting: 'Hi, $firstName 👋',
              subtitle: user?.institution ?? 'Student Portal',
              stats: const [],
            ),
          ),

          // ── Body ─────────────────────────────────────────────────
          DiklyPageBody(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(_studentDashProvider),
              color: _theme.primary,
              child: dashAsync.when(
                loading: () => ListView(
                  padding: const EdgeInsets.all(16),
                  children: const [
                    DiklyShimmerCard(height: 48, borderRadius: 999),
                    SizedBox(height: 20),
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
          ),
      ],
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
    final attendance = (d['recentAttendance'] as List? ?? []);
    final activeSession = d['activeSession'] as Map<String, dynamic>?;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      children: [
        // Device lock warning
        if (isLocked && lockUntil != null) ...[
          _DeviceLockBanner(until: lockUntil),
          const SizedBox(height: 12),
        ],

        // Active session banner
        if (activeSession != null) ...[
          DiklyFadeIn(
            child: _ActiveSessionBanner(session: activeSession, accentColor: _theme.primary),
          ),
          const SizedBox(height: 16),
        ],

        // Quick actions
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(icon: Icons.qr_code_scanner_rounded, label: 'Mark Attendance', color: _theme.primary, onTap: () => context.push('/attendance')),
                DiklyQuickChip(icon: Icons.history_rounded, label: 'History', color: const Color(0xFF0891B2), onTap: () => context.push('/attendance')),
                DiklyQuickChip(icon: Icons.school_outlined, label: 'My Courses', color: const Color(0xFF059669), onTap: () => context.push('/courses')),
                DiklyQuickChip(icon: Icons.quiz_outlined, label: 'Quizzes', color: const Color(0xFFD97706), onTap: () => context.push('/quizzes')),
                DiklyQuickChip(icon: Icons.grade_outlined, label: 'Report Card', color: const Color(0xFFDC2626), onTap: () => context.push('/gradebook')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 22),

        // Stats grid
        DiklyFadeIn(
          delay: const Duration(milliseconds: 100),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.55,
            children: [
              DiklyGradientStat(value: '${d['totalCheckIns'] ?? 0}', label: 'Total Check-ins', icon: Icons.fact_check_rounded, color: _theme.primary),
              DiklyGradientStat(value: '${d['attendanceRate'] ?? 0}%', label: 'Attendance Rate', icon: Icons.trending_up_rounded, color: const Color(0xFF059669)),
              DiklyGradientStat(value: '${d['enrolledCourses'] ?? 0}', label: 'Enrolled Courses', icon: Icons.school_rounded, color: const Color(0xFF0891B2)),
              DiklyGradientStat(value: '${d['quizzesTaken'] ?? 0}', label: 'Quizzes Taken', icon: Icons.quiz_rounded, color: const Color(0xFFD97706)),
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

        // Recent attendance
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
              else
                ...attendance.take(5).map((a) => _attendanceTile(a)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _assignmentTile(Map<String, dynamic> a) {
    final status = (a['status'] ?? 'pending').toString().toLowerCase();
    final Color statusColor;
    if (status == 'graded') statusColor = const Color(0xFF059669);
    else if (status == 'submitted') statusColor = DiklyColors.primary;
    else statusColor = const Color(0xFFD97706);

    return DiklyListTile(
      title: a['title'] ?? 'Assignment',
      subtitle: a['course'] ?? '',
      accentColor: statusColor,
      badge: DiklyStatusPill(label: status, color: statusColor),
      leadingIcon: Icons.assignment_outlined,
    );
  }

  Widget _attendanceTile(Map<String, dynamic> a) {
    final status = (a['status'] ?? '').toString().toLowerCase();
    final Color color;
    if (status == 'present') color = const Color(0xFF059669);
    else if (status == 'late') color = const Color(0xFFD97706);
    else color = const Color(0xFFDC2626);

    return DiklyListTile(
      title: a['session'] ?? a['sessionTitle'] ?? 'Session',
      subtitle: a['checkInTime'] ?? a['date'] ?? '',
      accentColor: color,
      badge: DiklyStatusPill(label: a['status'] ?? '', color: color),
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
    final mins = remaining.inMinutes % 60;
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
    );
  }
}

// ── Active session banner ─────────────────────────────────────────────────────

class _ActiveSessionBanner extends StatelessWidget {
  final Map<String, dynamic> session;
  final Color accentColor;
  const _ActiveSessionBanner({required this.session, required this.accentColor});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/attendance'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [accentColor, accentColor.withOpacity(0.8)]),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: accentColor.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(
          children: [
            const _LiveDot(color: Colors.white),
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
  final Color color;
  const _LiveDot({required this.color});

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
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
      ),
    );
  }
}
