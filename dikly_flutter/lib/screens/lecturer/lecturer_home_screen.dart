import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../providers/meetings_provider.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/stat_card.dart';
import '../../widgets/error_view.dart';

class LecturerHomeScreen extends ConsumerWidget {
  const LecturerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final meetingsAsync = ref.watch(meetingsProvider);
    final coursesAsync = ref.watch(coursesProvider);

    final firstName = (user?.name ?? 'Lecturer').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(meetingsProvider);
        ref.invalidate(coursesProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Plain welcome section
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back, $firstName',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      "Here's an overview of your workspace at $institution",
                      style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ),
                  if (deptBadge.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
                ],
              ),
            ],
          ),
          const SizedBox(height: 24),
          // 2x2 Stats grid
          Row(
            children: [
              Expanded(
                child: meetingsAsync.when(
                  data: (m) => StatCard(title: 'Sessions', value: m.length.toString(), icon: Icons.video_call_outlined, color: const Color(0xFFF97316)),
                  loading: () => StatCard(title: 'Sessions', value: '—', icon: Icons.video_call_outlined, color: const Color(0xFFF97316)),
                  error: (_, __) => StatCard(title: 'Sessions', value: '—', icon: Icons.video_call_outlined, color: const Color(0xFFF97316)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: coursesAsync.when(
                  data: (c) => StatCard(title: 'Courses', value: c.length.toString(), icon: Icons.book_outlined, color: const Color(0xFF16A34A)),
                  loading: () => StatCard(title: 'Courses', value: '—', icon: Icons.book_outlined, color: const Color(0xFF16A34A)),
                  error: (_, __) => StatCard(title: 'Courses', value: '—', icon: Icons.book_outlined, color: const Color(0xFF16A34A)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: meetingsAsync.when(
                  data: (m) => StatCard(
                    title: 'Students',
                    value: m.fold<int>(0, (sum, meeting) {
                      return sum + (meeting.participantCount ?? 0);
                    }).toString(),
                    icon: Icons.people_outlined,
                    color: DiklyColors.primary,
                  ),
                  loading: () => StatCard(title: 'Students', value: '—', icon: Icons.people_outlined, color: DiklyColors.primary),
                  error: (_, __) => StatCard(title: 'Students', value: '—', icon: Icons.people_outlined, color: DiklyColors.primary),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: StatCard(title: 'Quizzes', value: '—', icon: Icons.quiz_outlined, color: Color(0xFF7C3AED)),
              ),
            ],
          ),
          const SizedBox(height: 24),
          // Action buttons
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () => context.push('/sessions/create'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.play_circle, size: 18),
                  label: const Text('Start Session', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => context.push('/courses'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: DiklyColors.primary,
                    side: const BorderSide(color: DiklyColors.primary),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Create Course', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => context.push('/quizzes'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: DiklyColors.primary,
                    side: const BorderSide(color: DiklyColors.primary),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Create Quiz', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          // Recent Sessions
          const Text('Recent Sessions', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary)),
          const SizedBox(height: 12),
          meetingsAsync.when(
            data: (meetings) {
              if (meetings.isEmpty) {
                return _infoCard('No sessions yet');
              }
              return Column(
                children: meetings.take(5).map((m) => _LiveMeetingCard(meeting: m)).toList(),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(meetingsProvider)),
          ),
        ],
      ),
    );
  }

  Widget _infoCard(String msg) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: DiklyColors.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: DiklyColors.border)),
    child: Text(msg, style: const TextStyle(color: DiklyColors.textSecondary, fontSize: 13)),
  );
}

class _LiveMeetingCard extends ConsumerWidget {
  final meeting;
  const _LiveMeetingCard({required this.meeting});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: DiklyColors.success.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.live_tv, color: DiklyColors.success, size: 20),
        ),
        title: Text(meeting.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(
          meeting.status == 'live' ? 'Live now' : meeting.status ?? 'Session',
          style: TextStyle(
            color: meeting.status == 'live' ? DiklyColors.success : DiklyColors.textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        trailing: meeting.status == 'live'
            ? ElevatedButton(
                onPressed: () {},
                style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6)),
                child: const Text('Manage', style: TextStyle(fontSize: 12)),
              )
            : null,
      ),
    );
  }
}
