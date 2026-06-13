import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _deptInfoProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final results = await Future.wait([
    apiService.getDepartmentLecturers(),
    apiService.getDepartmentStudents(),
  ]);
  return {
    'lecturers': results[0],
    'students': results[1],
  };
});

class HodDeptMessagingScreen extends ConsumerWidget {
  const HodDeptMessagingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_deptInfoProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Dept. Messaging', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_deptInfoProvider)),
        data: (info) {
          final lecturers = (info['lecturers'] as List?) ?? [];
          final students = (info['students'] as List?) ?? [];
          final deptName = lecturers.isNotEmpty
            ? (lecturers[0]['department']?.toString() ?? '')
            : students.isNotEmpty
              ? (students[0]['department']?.toString() ?? '')
              : '';

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Department Messaging',
                subtitle: 'Send messages or announcements to your department',
              ),
              Row(
                children: [
                  Expanded(
                    child: _MessagingCard(
                      emoji: '👨‍🏫',
                      title: 'Message Lecturers',
                      subtitle: '${lecturers.length} lecturers${deptName.isNotEmpty ? ' in $deptName' : ''}',
                      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Message Lecturers — coming soon')),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _MessagingCard(
                      emoji: '🎓',
                      title: 'Message Students',
                      subtitle: '${students.length} students${deptName.isNotEmpty ? ' in $deptName' : ''}',
                      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Message Students — coming soon')),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _MessagingCard extends StatelessWidget {
  final String emoji;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _MessagingCard({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: DiklyCard(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 36)),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
          ],
        ),
      ),
    );
  }
}
