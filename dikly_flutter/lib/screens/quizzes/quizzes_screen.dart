import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/quiz.dart';
import '../../widgets/app_shell.dart';

import '../../widgets/ds/dikly_ds.dart';

class QuizzesScreen extends StatefulWidget {
  const QuizzesScreen({super.key});

  @override
  State<QuizzesScreen> createState() => _QuizzesScreenState();
}

class _QuizzesScreenState extends State<QuizzesScreen> {
  List<SnapQuiz> _quizzes = [];
  bool _loading = true;
  String? _error;
  bool _showUpcoming = true; // true=Upcoming, false=Past
  SnapQuiz? _activeQuiz;
  int _currentQuestion = 0;
  List<int?> _selectedAnswers = [];
  bool _quizFinished = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final quizzes = await apiService.getQuizzes();
      setState(() { _quizzes = quizzes; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _startQuiz(SnapQuiz quiz) async {
    SnapQuiz fullQuiz = quiz;
    if (quiz.questions.isEmpty) {
      try {
        fullQuiz = await apiService.getQuizById(quiz.id);
      } catch (_) {}
    }
    setState(() {
      _activeQuiz = fullQuiz;
      _currentQuestion = 0;
      _selectedAnswers = List.filled(fullQuiz.questions.length, null);
      _quizFinished = false;
    });
  }

  void _finishQuiz() => setState(() => _quizFinished = true);
  void _closeQuiz() => setState(() { _activeQuiz = null; _quizFinished = false; });

  @override
  Widget build(BuildContext context) {
    if (_activeQuiz != null) {
      if (_quizFinished) return _buildResults();
      return _buildQuizView();
    }

    final upcoming = _quizzes.where((q) => q.isActive && !q.isCompleted).toList();
    final past = _quizzes.where((q) => !q.isActive || q.isCompleted).toList();
    final displayList = _showUpcoming ? upcoming : past;

    return AppShell(
      title: 'Quizzes',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Quizzes',
              subtitle: 'Test your knowledge',
            ),
          ),
          // Pill tab bar: Upcoming / Past
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: DiklyColors.grey100,
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.all(4),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _showUpcoming = true),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: _showUpcoming ? Colors.white : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: _showUpcoming ? AppTheme.shadowSm : [],
                        ),
                        child: Text(
                          'Upcoming (${upcoming.length})',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _showUpcoming ? DiklyColors.text : DiklyColors.textLight,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _showUpcoming = false),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: !_showUpcoming ? Colors.white : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: !_showUpcoming ? AppTheme.shadowSm : [],
                        ),
                        child: Text(
                          'Past (${past.length})',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: !_showUpcoming ? DiklyColors.text : DiklyColors.textLight,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                          const SizedBox(height: 12),
                          const Text(
                            'Unable to load data. Pull down to refresh.',
                            style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                        ],
                      ))
                    : displayList.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.quiz_outlined,
                            title: _showUpcoming ? 'No upcoming quizzes' : 'No past quizzes',
                            subtitle: 'Quizzes will appear here when available',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: displayList.length,
                              itemBuilder: (ctx, i) => _QuizCard(
                                quiz: displayList[i],
                                onStart: () => _startQuiz(displayList[i]),
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuizView() {
    final quiz = _activeQuiz!;
    if (quiz.questions.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(quiz.title), leading: BackButton(onPressed: _closeQuiz)),
        body: const Center(child: Text('No questions available for this quiz')),
      );
    }

    final q = quiz.questions[_currentQuestion];
    final progress = (_currentQuestion + 1) / quiz.questions.length;

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: Text('Question ${_currentQuestion + 1}/${quiz.questions.length}'),
        leading: IconButton(icon: const Icon(Icons.close), onPressed: _closeQuiz),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(value: progress, backgroundColor: DiklyColors.border, color: DiklyColors.primary),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 8),
          Text(quiz.title, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary, fontWeight: FontWeight.w600)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: DiklyColors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: DiklyColors.primary.withOpacity(0.2)),
              boxShadow: AppTheme.shadowMd,
            ),
            child: Text(q.text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.5, color: DiklyColors.text)),
          ),
          const SizedBox(height: 20),
          for (int i = 0; i < q.options.length; i++)
            GestureDetector(
              onTap: () => setState(() => _selectedAnswers[_currentQuestion] = i),
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _selectedAnswers[_currentQuestion] == i
                      ? DiklyColors.primary.withOpacity(0.1)
                      : DiklyColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _selectedAnswers[_currentQuestion] == i ? DiklyColors.primary : DiklyColors.border,
                    width: _selectedAnswers[_currentQuestion] == i ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: _selectedAnswers[_currentQuestion] == i ? DiklyColors.primary : DiklyColors.background,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: _selectedAnswers[_currentQuestion] == i ? DiklyColors.primary : DiklyColors.border,
                        ),
                      ),
                      child: Center(
                        child: _selectedAnswers[_currentQuestion] == i
                            ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                            : Text(String.fromCharCode(65 + i), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: DiklyColors.textSecondary)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        q.options[i],
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: _selectedAnswers[_currentQuestion] == i ? FontWeight.w600 : FontWeight.w400,
                          color: DiklyColors.text,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 20),
          Row(
            children: [
              if (_currentQuestion > 0)
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() => _currentQuestion--),
                    child: const Text('Previous'),
                  ),
                ),
              if (_currentQuestion > 0) const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _selectedAnswers[_currentQuestion] == null ? null : () {
                    if (_currentQuestion < quiz.questions.length - 1) {
                      setState(() => _currentQuestion++);
                    } else {
                      _finishQuiz();
                    }
                  },
                  child: Text(_currentQuestion < quiz.questions.length - 1 ? 'Next' : 'Finish'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildResults() {
    final quiz = _activeQuiz!;
    int correct = 0;
    for (int i = 0; i < quiz.questions.length; i++) {
      if (_selectedAnswers[i] == quiz.questions[i].correctIndex) correct++;
    }
    final score = (correct / quiz.questions.length * 100).round();

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        color: score >= 70 ? DiklyColors.successLight : DiklyColors.errorLight,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          '$score%',
                          style: TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w800,
                            color: score >= 70 ? DiklyColors.success : DiklyColors.error,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text('Quiz Complete!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                    const SizedBox(height: 8),
                    Text(
                      '$correct out of ${quiz.questions.length} correct',
                      style: const TextStyle(fontSize: 16, color: DiklyColors.textSecondary),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      score >= 70 ? 'Great job!' : score >= 50 ? 'Good effort!' : 'Keep practicing!',
                      style: TextStyle(
                        color: score >= 70 ? DiklyColors.success : DiklyColors.warning,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: DiklyPrimaryButton(
                label: 'Back to Quizzes',
                onPressed: _closeQuiz,
                height: 50,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuizCard extends StatelessWidget {
  final SnapQuiz quiz;
  final VoidCallback onStart;

  const _QuizCard({required this.quiz, required this.onStart});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: DiklyColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.quiz_rounded, color: DiklyColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      quiz.title,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (quiz.courseName != null) ...[
                      const SizedBox(height: 4),
                      // Course chip
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: DiklyColors.primaryULight,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          quiz.courseName!,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.primary),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // Status badge
              DiklyBadge(
                label: quiz.isCompleted ? 'Completed' : quiz.isActive ? 'Active' : 'Closed',
                color: quiz.isCompleted ? DiklyColors.primary : quiz.isActive ? DiklyColors.success : DiklyColors.textLight,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Chips: date, duration, marks
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (quiz.startTime != null)
                DiklyInfoChip(
                  icon: Icons.calendar_today_outlined,
                  label: DateFormat('MMM d').format(quiz.startTime!),
                ),
              if (quiz.timeLimit != null)
                DiklyInfoChip(
                  icon: Icons.timer_outlined,
                  label: '${quiz.timeLimit} mins',
                ),
              if (quiz.totalMarks != null)
                DiklyInfoChip(
                  icon: Icons.bar_chart_rounded,
                  label: '${quiz.totalMarks} marks',
                ),
              if (quiz.totalQuestions != null)
                DiklyInfoChip(
                  icon: Icons.help_outline_rounded,
                  label: '${quiz.totalQuestions} questions',
                ),
            ],
          ),
          if (quiz.isActive && !quiz.isCompleted) ...[
            const SizedBox(height: 12),
            DiklyPrimaryButton(
              label: 'Start Quiz',
              onPressed: onStart,
              height: 42,
            ),
          ],
          if (quiz.isCompleted) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.check_circle_outline_rounded, size: 16, color: DiklyColors.success),
                const SizedBox(width: 6),
                Text(
                  'Completed${quiz.myScore != null ? " • Score: ${quiz.myScore}" : ""}',
                  style: const TextStyle(fontSize: 12, color: DiklyColors.success, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
