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

  static const _color = Color(0xFF7C3AED);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_studentDashProvider);
    final firstName = (user?.name ?? 'Student').split(' ').first;
    final h = DateTime.now().hour;
    final greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

    final isLocked = user?.deviceLocked == true &&
        user?.deviceLockedUntil != null &&
        user!.deviceLockedUntil!.isAfter(DateTime.now());
    final lockUntil = user?.deviceLockedUntil;

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_studentDashProvider),
        color: _color,
        child: dashAsync.when(
          loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SizedBox(height: 12),
              _GreetingBlock(greeting: greeting, firstName: firstName, user: user),
              const SizedBox(height: 16),
              const DiklyShimmerGrid(),
              const SizedBox(height: 20),
              const DiklyShimmerList(count: 4),
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
          data: (d) => _buildContent(context, ref, d, user, greeting, firstName, isLocked, lockUntil),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> d,
    dynamic user,
    String greeting,
    String firstName,
    bool isLocked,
    DateTime? lockUntil,
  ) {
    final assignments = (d['upcomingAssignments'] as List? ?? []);
    final attendance = (d['recentAttendance'] as List? ?? []);
    final activeSession = d['activeSession'] as Map<String, dynamic>?;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // Greeting
        DiklyFadeIn(
          child: _GreetingBlock(greeting: greeting, firstName: firstName, user: user),
        ),
        const SizedBox(height: 16),

        // Device lock warning
        if (isLocked && lockUntil != null) ...[
          DiklyFadeIn(child: _DeviceLockBanner(until: lockUntil)),
          const SizedBox(height: 12),
        ],

        // Active session banner
        if (activeSession != null) ...[
          DiklyFadeIn(
            child: _ActiveSessionBanner(session: activeSession),
          ),
          const SizedBox(height: 16),
        ],

        // Stats 2×2 grid
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.25,
            children: [
              _BorderedStat(
                title: 'TOTAL CHECK-INS',
                value: '${d['totalCheckIns'] ?? 0}',
                subtitle: 'All time',
                icon: Icons.fact_check_outlined,
                color: _color,
              ),
              _BorderedStat(
                title: 'ATTENDANCE RATE',
                value: '${d['attendanceRate'] ?? 0}%',
                subtitle: 'Overall',
                icon: Icons.trending_up_rounded,
                color: const Color(0xFF059669),
              ),
              _BorderedStat(
                title: 'ENROLLED COURSES',
                value: '${d['enrolledCourses'] ?? 0}',
                subtitle: 'Active courses',
                icon: Icons.school_outlined,
                color: const Color(0xFF0891B2),
              ),
              _BorderedStat(
                title: 'QUIZZES TAKEN',
                value: '${d['quizzesTaken'] ?? 0}',
                subtitle: 'Completed',
                icon: Icons.quiz_outlined,
                color: const Color(0xFFD97706),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Quick actions label
        DiklyFadeIn(
          delay: const Duration(milliseconds: 100),
          child: Text(
            'QUICK ACTIONS',
            style: GoogleFonts.dmSans(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF9CA3AF),
              letterSpacing: 1.5,
            ),
          ),
        ),
        const SizedBox(height: 10),

        // Quick action chips
        DiklyFadeIn(
          delay: const Duration(milliseconds: 120),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                DiklyQuickChip(
                  icon: Icons.qr_code_scanner_rounded,
                  label: 'Mark Attendance',
                  color: _color,
                  onTap: () => context.push('/attendance'),
                ),
                DiklyQuickChip(
                  icon: Icons.history_rounded,
                  label: 'History',
                  color: const Color(0xFF0891B2),
                  onTap: () => context.push('/attendance'),
                ),
                DiklyQuickChip(
                  icon: Icons.school_outlined,
                  label: 'My Courses',
                  color: const Color(0xFF059669),
                  onTap: () => context.push('/courses'),
                ),
                DiklyQuickChip(
                  icon: Icons.quiz_outlined,
                  label: 'Quizzes',
                  color: const Color(0xFFD97706),
                  onTap: () => context.push('/quizzes'),
                ),
                DiklyQuickChip(
                  icon: Icons.grade_outlined,
                  label: 'Report Card',
                  color: const Color(0xFFDC2626),
                  onTap: () => context.push('/gradebook'),
                ),
              ],
            ),
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

// ── Greeting block ────────────────────────────────────────────────────────────

class _GreetingBlock extends StatelessWidget {
  final String greeting;
  final String firstName;
  final dynamic user;
  const _GreetingBlock({required this.greeting, required this.firstName, required this.user});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$greeting, $firstName 👋',
          style: GoogleFonts.dmSans(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF0D1117),
            height: 1.2,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '${user?.institutionCode ?? 'Student Portal'} · ${DateFormat('EEE, MMM d').format(DateTime.now())}',
          style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF6B7280)),
        ),
      ],
    );
  }
}

// ── Bordered stat card ────────────────────────────────────────────────────────

class _BorderedStat extends StatelessWidget {
  final String title, value, subtitle;
  final IconData icon;
  final Color color;
  const _BorderedStat({
    required this.title,
    required this.value,
    required this.subtitle,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(
          top: BorderSide(color: color, width: 3),
          left: const BorderSide(color: Color(0xFFE5E7EB)),
          right: const BorderSide(color: Color(0xFFE5E7EB)),
          bottom: const BorderSide(color: Color(0xFFE5E7EB)),
        ),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const Spacer(),
          Text(
            value,
            style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: color, height: 1),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: GoogleFonts.dmSans(fontSize: 10, color: const Color(0xFF6B7280)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 0.8),
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
      ),
    );
  }
}

// ── Active session banner ─────────────────────────────────────────────────────

class _ActiveSessionBanner extends StatelessWidget {
  final Map<String, dynamic> session;
  const _ActiveSessionBanner({required this.session});

  static const _color = Color(0xFF7C3AED);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/attendance'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [_color, _color.withOpacity(0.8)]),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: _color.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
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
