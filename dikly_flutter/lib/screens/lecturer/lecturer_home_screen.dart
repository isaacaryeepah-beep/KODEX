import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../providers/meetings_provider.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/ds/dikly_ds.dart';


class LecturerHomeScreen extends ConsumerWidget {
  const LecturerHomeScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final meetingsAsync = ref.watch(meetingsProvider);
    final coursesAsync = ref.watch(coursesProvider);

    final firstName = (user?.name ?? 'Lecturer').split(' ').first;
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(meetingsProvider);
        ref.invalidate(coursesProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Greeting ─────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()}, $firstName!',
                      style: GoogleFonts.dmSans(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.text,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Lecturer Portal',
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              if (deptBadge.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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
          ),
          const SizedBox(height: 20),

          // ── Stats Grid ───────────────────────────────────────────────
          GridView.count(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              meetingsAsync.when(
                data: (m) => _StatCard(
                  icon: Icons.video_call_outlined,
                  iconColor: const Color(0xFFF97316),
                  iconBg: const Color(0xFFFFF7ED),
                  value: m.length.toString(),
                  label: 'Sessions',
                ),
                loading: () => const _StatCard(icon: Icons.video_call_outlined, iconColor: Color(0xFFF97316), iconBg: Color(0xFFFFF7ED), value: '—', label: 'Sessions'),
                error: (_, __) => const _StatCard(icon: Icons.video_call_outlined, iconColor: Color(0xFFF97316), iconBg: Color(0xFFFFF7ED), value: '—', label: 'Sessions'),
              ),
              coursesAsync.when(
                data: (c) => _StatCard(
                  icon: Icons.book_outlined,
                  iconColor: DiklyColors.success,
                  iconBg: DiklyColors.successLight,
                  value: c.length.toString(),
                  label: 'Courses',
                ),
                loading: () => const _StatCard(icon: Icons.book_outlined, iconColor: DiklyColors.success, iconBg: DiklyColors.successLight, value: '—', label: 'Courses'),
                error: (_, __) => const _StatCard(icon: Icons.book_outlined, iconColor: DiklyColors.success, iconBg: DiklyColors.successLight, value: '—', label: 'Courses'),
              ),
              meetingsAsync.when(
                data: (m) => _StatCard(
                  icon: Icons.people_outlined,
                  iconColor: DiklyColors.primary,
                  iconBg: DiklyColors.primaryULight,
                  value: m.fold<int>(0, (s, x) => s + (x.participantCount ?? 0)).toString(),
                  label: 'Students',
                ),
                loading: () => const _StatCard(icon: Icons.people_outlined, iconColor: DiklyColors.primary, iconBg: DiklyColors.primaryULight, value: '—', label: 'Students'),
                error: (_, __) => const _StatCard(icon: Icons.people_outlined, iconColor: DiklyColors.primary, iconBg: DiklyColors.primaryULight, value: '—', label: 'Students'),
              ),
              const _StatCard(
                icon: Icons.quiz_outlined,
                iconColor: Color(0xFF7C3AED),
                iconBg: Color(0xFFF3E8FF),
                value: '—',
                label: 'Quizzes',
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ── Quick Actions ─────────────────────────────────────────────
          Text(
            'Quick Actions',
            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _ActionButton(
                  label: 'Start Session',
                  icon: Icons.play_circle_outline_rounded,
                  color: DiklyColors.primary,
                  onTap: () => context.push('/sessions/create'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ActionButton(
                  label: 'Create Course',
                  icon: Icons.add_circle_outline_rounded,
                  color: DiklyColors.success,
                  onTap: () => context.push('/courses'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ActionButton(
                  label: 'Create Quiz',
                  icon: Icons.quiz_outlined,
                  color: const Color(0xFF7C3AED),
                  onTap: () => context.push('/quizzes'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ── Recent Sessions ───────────────────────────────────────────
          Text(
            'Recent Sessions',
            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
          ),
          const SizedBox(height: 12),
          meetingsAsync.when(
            data: (meetings) {
              if (meetings.isEmpty) {
                return const DiklyEmptyState(
                  icon: Icons.video_call_outlined,
                  title: 'No sessions yet',
                  subtitle: 'Start a session to get going',
                );
              }
              return Column(
                children: meetings.take(5).map((m) => _SessionCard(meeting: m)).toList(),
              );
            },
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (e, _) => DiklyErrorView(
              message: e.toString(),
              onRetry: () => ref.invalidate(meetingsProvider),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

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
            child: Icon(icon, color: iconColor, size: 20),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.text,
                  height: 1.0,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: DiklyColors.textLight),
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

// ── Action Button ─────────────────────────────────────────────────────────────

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                style: GoogleFonts.dmSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: DiklyColors.text,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Session Card ──────────────────────────────────────────────────────────────

class _SessionCard extends StatelessWidget {
  final Meeting meeting;
  const _SessionCard({required this.meeting});

  @override
  Widget build(BuildContext context) {
    final isLive = meeting.status == 'live';
    final statusColor = isLive ? DiklyColors.success : DiklyColors.primary;

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              isLive ? Icons.live_tv_rounded : Icons.video_call_outlined,
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
                  meeting.title,
                  style: GoogleFonts.dmSans(
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
                    style: const TextStyle(fontSize: 12, color: DiklyColors.textLight),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          DiklyBadge(
            label: (meeting.status ?? 'session').toUpperCase(),
            color: statusColor,
          ),
        ],
      ),
    );
  }
}
