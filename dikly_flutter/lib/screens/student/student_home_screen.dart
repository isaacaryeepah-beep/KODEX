import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../providers/meetings_provider.dart';
import '../../providers/announcements_provider.dart';
import '../../providers/courses_provider.dart';
import '../../providers/assignments_provider.dart';
import '../../widgets/ds/dikly_ds.dart';

import '../../models/meeting.dart';
import '../../models/announcement.dart';

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
    final meetingsAsync = ref.watch(upcomingMeetingsProvider);
    final announcementsAsync = ref.watch(announcementsProvider);
    final coursesAsync = ref.watch(coursesProvider);
    final assignmentsAsync = ref.watch(assignmentsProvider);

    final firstName = (user?.name ?? 'Student').split(' ').first;

    // Derive live stats from loaded providers
    final courseCount = coursesAsync.valueOrNull?.length;
    final pendingAssignments = assignmentsAsync.valueOrNull
        ?.where((a) => !a.isSubmitted && !a.isOverdue)
        .length;
    final overdueAssignments = assignmentsAsync.valueOrNull
        ?.where((a) => a.isOverdue)
        .length;
    final upcomingMeetingCount = meetingsAsync.valueOrNull?.length;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(upcomingMeetingsProvider);
        ref.invalidate(announcementsProvider);
        ref.invalidate(coursesProvider);
        ref.invalidate(assignmentsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Greeting banner ──────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: DiklyColors.gradientPrimary,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${_greeting()}, $firstName!',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        DateFormat('EEEE, MMMM d').format(DateTime.now()),
                        style: const TextStyle(
                          fontSize: 13,
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.18),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.school_outlined, color: Colors.white, size: 26),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── Stat Cards 2×2 grid ──────────────────────────────────────
          GridView.count(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _StatCard(
                icon: Icons.book_outlined,
                iconColor: DiklyColors.primary,
                iconBg: DiklyColors.primaryULight,
                value: courseCount != null ? '$courseCount' : '—',
                label: 'Courses Enrolled',
              ),
              _StatCard(
                icon: Icons.assignment_outlined,
                iconColor: (pendingAssignments != null && pendingAssignments > 0)
                    ? const Color(0xFFD97706)
                    : DiklyColors.textLight,
                iconBg: const Color(0xFFFEF3C7),
                value: pendingAssignments != null ? '$pendingAssignments' : '—',
                label: 'Assignments Due',
              ),
              _StatCard(
                icon: Icons.warning_amber_outlined,
                iconColor: (overdueAssignments != null && overdueAssignments > 0)
                    ? DiklyColors.error
                    : DiklyColors.success,
                iconBg: (overdueAssignments != null && overdueAssignments > 0)
                    ? DiklyColors.errorLight
                    : DiklyColors.successLight,
                value: overdueAssignments != null ? '$overdueAssignments' : '—',
                label: 'Overdue',
              ),
              _StatCard(
                icon: Icons.video_call_outlined,
                iconColor: const Color(0xFF7C3AED),
                iconBg: const Color(0xFFF3E8FF),
                value: upcomingMeetingCount != null ? '$upcomingMeetingCount' : '—',
                label: 'Upcoming Classes',
              ),
            ],
          ),
          const SizedBox(height: 20),

          // ── Quick Actions ────────────────────────────────────────────
          const Text(
            'Quick Actions',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: DiklyColors.text,
            ),
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 4,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 0.85,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _QuickAction(
                icon: Icons.fingerprint,
                label: 'Attendance',
                color: DiklyColors.primary,
                onTap: () => context.push('/attendance'),
              ),
              _QuickAction(
                icon: Icons.assignment_outlined,
                label: 'Assignments',
                color: const Color(0xFFD97706),
                onTap: () => context.push('/assignments'),
              ),
              _QuickAction(
                icon: Icons.quiz_outlined,
                label: 'Quizzes',
                color: const Color(0xFF7C3AED),
                onTap: () => context.push('/quizzes'),
              ),
              _QuickAction(
                icon: Icons.calendar_today_outlined,
                label: 'Timetable',
                color: const Color(0xFF0D9488),
                onTap: () => context.push('/timetable'),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ── Upcoming Meetings ────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Upcoming Classes',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.text,
                ),
              ),
              TextButton(
                onPressed: () => context.push('/meetings'),
                child: const Text('See all', style: TextStyle(fontSize: 13, color: DiklyColors.primary)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          meetingsAsync.when(
            data: (meetings) => meetings.isEmpty
                ? DiklyEmptyState(
                    icon: Icons.video_call_outlined,
                    title: 'No upcoming classes',
                    subtitle: 'Classes will appear here when scheduled.',
                  )
                : Column(
                    children: meetings.take(5).map((m) => _MeetingCard(meeting: m)).toList(),
                  ),
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (e, _) => DiklyErrorView(
              message: e.toString(),
              onRetry: () => ref.invalidate(upcomingMeetingsProvider),
            ),
          ),
          const SizedBox(height: 24),

          // ── Announcements ────────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Announcements',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.text,
                ),
              ),
              TextButton(
                onPressed: () => context.push('/announcements'),
                child: const Text('See all', style: TextStyle(fontSize: 13, color: DiklyColors.primary)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          announcementsAsync.when(
            data: (list) => list.isEmpty
                ? DiklyEmptyState(
                    icon: Icons.campaign_outlined,
                    title: 'No announcements',
                    subtitle: 'Announcements from your institution will appear here.',
                  )
                : Column(
                    children: list.take(5).map((a) => _AnnouncementCard(a: a)).toList(),
                  ),
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (e, _) => DiklyErrorView(
              message: e.toString(),
              onRetry: () => ref.invalidate(announcementsProvider),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Stat Card ───────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String value;
  final String label;

  const _StatCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      borderRadius: 10,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: iconColor, size: 22),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.text,
                  height: 1.0,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 13,
                  color: DiklyColors.textLight,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Quick Action Button ─────────────────────────────────────────────────────

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: DiklyCard(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        borderRadius: 10,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: DiklyColors.text,
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Meeting Card ────────────────────────────────────────────────────────────

class _MeetingCard extends StatelessWidget {
  final Meeting meeting;
  const _MeetingCard({required this.meeting});

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    switch (meeting.status) {
      case 'live':
        statusColor = DiklyColors.success;
        break;
      case 'upcoming':
        statusColor = DiklyColors.primary;
        break;
      default:
        statusColor = DiklyColors.textLight;
    }

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      borderRadius: 10,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: DiklyColors.primaryULight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.video_call_outlined, color: DiklyColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meeting.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: DiklyColors.text,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (meeting.scheduledStart != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    DateFormat('MMM d · h:mm a').format(meeting.scheduledStart!),
                    style: const TextStyle(
                      fontSize: 12,
                      color: DiklyColors.textLight,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          DiklyBadge(
            label: meeting.status.toUpperCase(),
            color: statusColor,
          ),
        ],
      ),
    );
  }
}

// ── Announcement Card ───────────────────────────────────────────────────────

class _AnnouncementCard extends StatelessWidget {
  final Announcement a;
  const _AnnouncementCard({required this.a});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      borderRadius: 10,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.campaign_outlined, color: Color(0xFFD97706), size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  a.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: DiklyColors.text,
                  ),
                ),
                if (a.content.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    a.content,
                    style: const TextStyle(
                      fontSize: 13,
                      color: DiklyColors.textSecondary,
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
