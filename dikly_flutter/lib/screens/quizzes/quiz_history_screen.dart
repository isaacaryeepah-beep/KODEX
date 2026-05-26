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
        title: const Text('Quiz History'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: DiklyColors.border, height: 1),
        ),
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
    if (quizzes.isEmpty) {
      return const DiklyEmptyState(
        icon: Icons.emoji_events_outlined,
        title: 'No quizzes completed yet',
        subtitle: 'Your quiz results will appear here',
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Header
        const DiklyScreenHeader(
          title: 'Quiz History',
          subtitle: 'Your performance over time',
        ),

        // Summary stats row
        DiklyCard(
          margin: EdgeInsets.zero,
          child: Row(
            children: [
              _SummaryItem(
                label: 'Total Quizzes',
                value: '$_totalQuizzes',
                icon: Icons.quiz_outlined,
                color: DiklyColors.primary,
              ),
              Container(width: 1, height: 40, color: DiklyColors.border),
              _SummaryItem(
                label: 'Avg Score',
                value: '${_averageScore.toStringAsFixed(1)}%',
                icon: Icons.bar_chart_rounded,
                color: DiklyColors.warning,
              ),
              Container(width: 1, height: 40, color: DiklyColors.border),
              _SummaryItem(
                label: 'Pass Rate',
                value: '${_passRate.toStringAsFixed(0)}%',
                icon: Icons.check_circle_outline_rounded,
                color: DiklyColors.success,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Completed Quizzes',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: DiklyColors.text),
        ),
        const SizedBox(height: 12),
        ...quizzes.map((quiz) => _QuizHistoryCard(quiz: quiz)),
      ],
    );
  }
}

class _SummaryItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _SummaryItem({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

class _QuizHistoryCard extends StatelessWidget {
  final Map<String, dynamic> quiz;

  const _QuizHistoryCard({required this.quiz});

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
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                ),
              ),
              const SizedBox(width: 8),
              // Pass/Fail score badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: (_passed ? DiklyColors.success : DiklyColors.error).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: (_passed ? DiklyColors.success : DiklyColors.error).withOpacity(0.4),
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
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text),
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
                  style: TextStyle(color: _percentageColor, fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              const Spacer(),
              if (_timeTaken.isNotEmpty)
                DiklyInfoChip(
                  icon: Icons.timer_outlined,
                  label: _timeTaken,
                ),
            ],
          ),
          if (_completedAt.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_today_outlined, size: 13, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(
                  _formatDate(_completedAt),
                  style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
