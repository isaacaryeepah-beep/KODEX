import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _lecturerQuizStatsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getLecturerQuizzesWithStats(),
);

class LecturerPerformanceScreen extends ConsumerWidget {
  const LecturerPerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_lecturerQuizStatsProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Performance'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: async.when(
        loading: () => const Center(
          child: Text('Loading performance data...', style: TextStyle(fontSize: 14, color: DiklyColors.textSecondary)),
        ),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load performance data'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_lecturerQuizStatsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (quizzes) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_lecturerQuizStatsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Student Performance',
                subtitle: 'Overview of student results across all your quizzes',
              ),
              if (quizzes.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: const Center(
                    child: Text(
                      'No quizzes yet. Create a quiz to see performance data.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Column(
                    children: [
                      // Table header
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: const BoxDecoration(
                          color: Color(0xFFF9FAFB),
                          borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
                          border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5)),
                        ),
                        child: const Row(
                          children: [
                            Expanded(flex: 3, child: _TableHeader('QUIZ')),
                            Expanded(flex: 2, child: _TableHeader('COURSE')),
                            Expanded(flex: 2, child: _TableHeader('SUBMISSIONS')),
                            Expanded(flex: 2, child: _TableHeader('AVG SCORE')),
                            Expanded(flex: 3, child: _TableHeader('PASS RATE')),
                          ],
                        ),
                      ),
                      ...quizzes.map((q) => _QuizRow(quiz: q)),
                    ],
                  ),
                ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _TableHeader extends StatelessWidget {
  final String text;
  const _TableHeader(this.text);
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.3),
  );
}

class _QuizRow extends StatelessWidget {
  final Map<String, dynamic> quiz;
  const _QuizRow({required this.quiz});

  @override
  Widget build(BuildContext context) {
    final title = quiz['title']?.toString() ?? 'Untitled';
    final stats = (quiz['stats'] as Map?) ?? {};
    final courseTitle = (quiz['course'] is Map ? quiz['course']['title'] : null)?.toString() ?? '—';
    final totalAttempts = (stats['totalAttempts'] as num?)?.toInt() ?? 0;
    final avgScore = (stats['averageScore'] as num?)?.toDouble() ?? 0.0;
    final passRate = (stats['passRate'] as num?)?.toDouble() ?? 0.0;

    Color scoreColor;
    if (avgScore >= 70) {
      scoreColor = const Color(0xFF16A34A);
    } else if (avgScore >= 50) {
      scoreColor = const Color(0xFFD97706);
    } else {
      scoreColor = const Color(0xFFDC2626);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          Expanded(
            flex: 2,
            child: Text(courseTitle, style: const TextStyle(fontSize: 11, color: DiklyColors.textLight), maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          Expanded(
            flex: 2,
            child: Text('$totalAttempts', style: const TextStyle(fontSize: 12, color: DiklyColors.text)),
          ),
          Expanded(
            flex: 2,
            child: Text(
              '${avgScore.toStringAsFixed(1)}%',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: scoreColor),
            ),
          ),
          Expanded(
            flex: 3,
            child: Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: passRate / 100,
                      backgroundColor: const Color(0xFFE5E7EB),
                      valueColor: AlwaysStoppedAnimation<Color>(scoreColor),
                      minHeight: 6,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '${passRate.toStringAsFixed(0)}%',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: scoreColor),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
