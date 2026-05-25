import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(meetingsProvider);
        ref.invalidate(coursesProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _WelcomeCard(name: user?.name ?? 'Lecturer'),
          const SizedBox(height: 20),
          const Text('Your Classes', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: meetingsAsync.when(
                data: (m) => StatCard(title: 'Total Meetings', value: m.length.toString(), icon: Icons.video_call_outlined, color: const Color(0xFF7C3AED)),
                loading: () => StatCard(title: 'Total Meetings', value: '—', icon: Icons.video_call_outlined, color: const Color(0xFF7C3AED)),
                error: (_, __) => StatCard(title: 'Total Meetings', value: '—', icon: Icons.video_call_outlined, color: const Color(0xFF7C3AED)),
              )),
              const SizedBox(width: 12),
              Expanded(child: coursesAsync.when(
                data: (c) => StatCard(title: 'Active Courses', value: c.length.toString(), icon: Icons.book_outlined, color: DiklyColors.primary),
                loading: () => StatCard(title: 'Active Courses', value: '—', icon: Icons.book_outlined, color: DiklyColors.primary),
                error: (_, __) => StatCard(title: 'Active Courses', value: '—', icon: Icons.book_outlined, color: DiklyColors.primary),
              )),
            ],
          ),
          const SizedBox(height: 24),
          const Text('Live Classes', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          meetingsAsync.when(
            data: (meetings) {
              final live = meetings.where((m) => m.status == 'live').toList();
              return live.isEmpty
                  ? _infoCard('No live classes right now')
                  : Column(children: live.map((m) => _LiveMeetingCard(meeting: m)).toList());
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

class _WelcomeCard extends StatelessWidget {
  final String name;
  const _WelcomeCard({required this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF2563EB)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: const Color(0xFF7C3AED).withOpacity(0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Lecturer Portal', style: TextStyle(color: Colors.white70, fontSize: 12, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text(name.split(' ').first, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
        ])),
        const Icon(Icons.cast_for_education, color: Colors.white60, size: 40),
      ]),
    );
  }
}

class _LiveMeetingCard extends ConsumerWidget {
  final dynamic meeting;
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
        subtitle: const Text('Live now', style: TextStyle(color: DiklyColors.success, fontSize: 12, fontWeight: FontWeight.w600)),
        trailing: ElevatedButton(
          onPressed: () {},
          style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6)),
          child: const Text('Manage', style: TextStyle(fontSize: 12)),
        ),
      ),
    );
  }
}
