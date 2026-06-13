import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _quizHistoryProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getQuizHistory(),
);

class QuizHistoryScreen extends ConsumerWidget {
  const QuizHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_quizHistoryProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('My Results'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load quiz history'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_quizHistoryProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_quizHistoryProvider),
          child: _QuizHistoryBody(quizzes: data),
        ),
      ),
    );
  }
}

class _QuizHistoryBody extends StatelessWidget {
  final List<Map<String, dynamic>> quizzes;

  const _QuizHistoryBody({required this.quizzes});

  int get _totalQuizzes => quizzes.length;

  double get _averageScore {
    if (quizzes.isEmpty) return 0.0;
    final total = quizzes.fold<double>(0.0, (sum, q) {
      final pct = (q['percentage'] as num?)?.toDouble() ?? 0.0;
      return sum + pct;
    });
    return total / quizzes.length;
  }

  double get _passRate {
    if (quizzes.isEmpty) return 0.0;
    final passed = quizzes.where((q) => q['passed'] == true).length;
    return (passed / quizzes.length) * 100;
  }

  @override
  Widget build(BuildContext context) {
    final pending = quizzes.where((q) => q['passed'] == null).length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'My Quiz Results',
          subtitle: 'Your performance across all quizzes',
        ),
        // 3 stat cards
        Row(
          children: [
            _StatCard(value: '$_totalQuizzes', label: 'COMPLETED', color: const Color(0xFF7C3AED)),
            const SizedBox(width: 10),
            _StatCard(value: '$pending', label: 'PENDING', color: DiklyColors.success),
            const SizedBox(width: 10),
            _StatCard(value: '${_averageScore.toStringAsFixed(0)}%', label: 'AVG SCORE', color: DiklyColors.warning),
          ],
        ),
        const SizedBox(height: 16),
        if (quizzes.isEmpty)
          DiklyCard(
            padding: const EdgeInsets.all(32),
            child: const Center(
              child: Text('No quizzes completed yet.', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
            ),
          )
        else ...[
          const Text('Completed Quizzes', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
          const SizedBox(height: 10),
          ...quizzes.map((quiz) => _QuizCard(quiz: quiz)),
        ],
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
          boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 1))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 10),
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color, height: 1)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.3)),
          ],
        ),
      ),
    );
  }
}

class _QuizCard extends StatelessWidget {
  final Map<String, dynamic> quiz;

  const _QuizCard({required this.quiz});

  String get _title => quiz['quizTitle']?.toString() ?? 'Untitled Quiz';
  int get _score => (quiz['score'] as num?)?.toInt() ?? 0;
  int get _maxScore => (quiz['maxScore'] as num?)?.toInt() ?? 0;
  double get _percentage => (quiz['percentage'] as num?)?.toDouble() ?? 0.0;
  bool get _passed => quiz['passed'] == true;
  String get _completedAt => quiz['completedAt']?.toString() ?? '';
  String get _timeTaken => quiz['timeTaken']?.toString() ?? '';

  Color get _percentageColor => _percentage >= 50 ? DiklyColors.success : DiklyColors.error;

  String _formatDate(String raw) {
    try {
      final dt = DateTime.parse(raw);
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _title,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: (_passed ? DiklyColors.success : DiklyColors.error)
                      .withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: (_passed ? DiklyColors.success : DiklyColors.error)
                        .withOpacity(0.4),
                  ),
                ),
                child: Text(
                  _passed ? 'PASS' : 'FAIL',
                  style: TextStyle(
                    color: _passed ? DiklyColors.success : DiklyColors.error,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              // Score fraction
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: DiklyColors.background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: DiklyColors.border),
                ),
                child: Text(
                  '$_score / $_maxScore',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              // Percentage badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _percentageColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _percentageColor.withOpacity(0.4)),
                ),
                child: Text(
                  '${_percentage.toStringAsFixed(1)}%',
                  style: TextStyle(
                    color: _percentageColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Spacer(),
              if (_timeTaken.isNotEmpty)
                Row(
                  children: [
                    const Icon(Icons.timer_outlined,
                        size: 13, color: DiklyColors.textSecondary),
                    const SizedBox(width: 3),
                    Text(
                      _timeTaken,
                      style: const TextStyle(
                          fontSize: 12, color: DiklyColors.textSecondary),
                    ),
                  ],
                ),
            ],
          ),
          if (_completedAt.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_today_outlined,
                    size: 13, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(
                  _formatDate(_completedAt),
                  style: const TextStyle(
                      fontSize: 12, color: DiklyColors.textSecondary),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
