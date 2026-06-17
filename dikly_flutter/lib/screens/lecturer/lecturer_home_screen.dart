import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _lecturerDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getLecturerDashboardData(),
);

// Lecturer role color: amber
const _lecturerColor = Color(0xFFD97706);
const _statPrimary   = Color(0xFF2563EB);

class LecturerHomeScreen extends ConsumerWidget {
  const LecturerHomeScreen({super.key});

  static const _theme = DiklyRoleTheme.lecturer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user      = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_lecturerDashProvider);

    return Container(
      color: const Color(0xFFF4F6F9),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_lecturerDashProvider),
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
                onRetry: () => ref.invalidate(_lecturerDashProvider),
              ),
            ],
          ),
          data: (d) => _buildContent(context, ref, d, user),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> d,
    dynamic user,
  ) {
    final sessions = (d['recentSessions']    as List? ?? []);
    final meetings = (d['scheduledMeetings'] as List? ?? []);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        // Page sub-header
        DiklyFadeIn(
          child: _LecturerHeader(
            name: (user?.name ?? 'Lecturer').split(' ').first,
            company: user?.company ?? user?.institutionCode ?? 'Dikly',
            department: user?.department,
          ),
        ),
        const SizedBox(height: 14),

        // Quick actions button row
        DiklyFadeIn(
          delay: const Duration(milliseconds: 60),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _QuickBtn(label: 'Start Session',  filled: true,  onTap: () => context.push('/sessions')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'Create Course',  filled: false, onTap: () => context.push('/courses')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'Create Quiz',    filled: false, onTap: () => context.push('/quizzes')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'Attendance',     filled: false, onTap: () => context.push('/attendance')),
                const SizedBox(width: 8),
                _QuickBtn(label: 'Reports',        filled: false, onTap: () => context.push('/reports')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Stat cards — web style (centered, no icon)
        DiklyFadeIn(
          delay: const Duration(milliseconds: 80),
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.4,
            children: [
              _WebStatCard(value: '${d['totalStudents'] ?? 0}',  label: 'STUDENTS',         color: _statPrimary),
              _WebStatCard(value: '${d['activeCourses'] ?? 0}',  label: 'COURSES',           color: _statPrimary),
              _WebStatCard(value: '${d['totalSessions'] ?? 0}',  label: 'SESSIONS',          color: _statPrimary),
              _WebStatCard(value: '${d['quizzesCreated'] ?? 0}', label: 'QUIZZES CREATED',   color: _statPrimary),
            ],
          ),
        ),
        const SizedBox(height: 22),

        // Recent sessions list
        DiklyFadeIn(
          delay: const Duration(milliseconds: 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DiklySectionRow(
                title: 'Recent Sessions',
                count: sessions.length,
                onViewAll: () => context.push('/sessions'),
              ),
              if (sessions.isEmpty)
                const DiklyEmptyCard(icon: Icons.video_call_outlined, message: 'No sessions yet — start one above')
              else
                ...sessions.take(4).map((s) => _sessionTile(s, context)),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Upcoming meetings
        if (meetings.isNotEmpty) ...[
          DiklyFadeIn(
            delay: const Duration(milliseconds: 160),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklySectionRow(
                  title: 'Scheduled Meetings',
                  count: meetings.length,
                  onViewAll: () => context.push('/meetings'),
                ),
                ...meetings.take(3).map((m) => _meetingTile(m, context)),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _sessionTile(Map<String, dynamic> s, BuildContext context) {
    final status = (s['status'] ?? 'closed').toString().toLowerCase();
    final isLive = status == 'active' || status == 'open';
    final color  = isLive ? const Color(0xFF16A34A) : const Color(0xFF6B7280);
    return DiklyListTile(
      title: s['title'] ?? s['courseTitle'] ?? 'Session',
      subtitle: s['startedAt'] != null
          ? DateFormat('MMM d, h:mm a').format(DateTime.tryParse(s['startedAt'].toString()) ?? DateTime.now())
          : (s['createdBy'] ?? ''),
      accentColor: color,
      badge: DiklyStatusPill.fromStatus(isLive ? 'live' : status),
      onTap: () => context.push('/sessions'),
      leadingIcon: Icons.video_call_outlined,
    );
  }

  Widget _meetingTile(Map<String, dynamic> m, BuildContext context) {
    final now   = DateTime.now();
    final start = DateTime.tryParse(m['startTime']?.toString() ?? '');
    final end   = DateTime.tryParse(m['endTime']?.toString()   ?? '');
    final isLive = start != null && end != null && now.isAfter(start) && now.isBefore(end);
    final color  = isLive ? const Color(0xFF16A34A) : _statPrimary;
    final subtitle = start != null ? DateFormat('MMM d · h:mm a').format(start) : '';

    return DiklyListTile(
      title: m['title'] ?? 'Meeting',
      subtitle: subtitle,
      accentColor: color,
      badge: DiklyStatusPill(label: isLive ? 'LIVE' : 'Scheduled', color: color, live: isLive),
      onTap: () => context.push('/meetings'),
      leadingIcon: Icons.groups_outlined,
    );
  }
}

// ── Lecturer page header ──────────────────────────────────────────────────────

class _LecturerHeader extends StatelessWidget {
  final String name;
  final String company;
  final String? department;

  const _LecturerHeader({required this.name, required this.company, this.department});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Welcome back, $name',
          style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Text(
              company,
              style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
            ),
            if (department != null && department!.isNotEmpty) ...[
              Text(
                ' · ',
                style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
              ),
              Text(
                department!.toUpperCase(),
                style: GoogleFonts.dmSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFFD97706),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

// ── Quick action button ───────────────────────────────────────────────────────

class _QuickBtn extends StatelessWidget {
  final String label;
  final bool filled;
  final VoidCallback onTap;

  const _QuickBtn({required this.label, required this.filled, required this.onTap});

  @override
  Widget build(BuildContext context) {
    const color = _lecturerColor;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: filled ? color : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: filled ? color : const Color(0xFFD1D5DB)),
          boxShadow: [
            BoxShadow(color: color.withValues(alpha: 0.06), blurRadius: 4, offset: const Offset(0, 1)),
          ],
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
