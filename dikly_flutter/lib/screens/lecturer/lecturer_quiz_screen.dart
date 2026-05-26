import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/quiz.dart';

class LecturerQuizScreen extends StatefulWidget {
  const LecturerQuizScreen({super.key});

  @override
  State<LecturerQuizScreen> createState() => _LecturerQuizScreenState();
}

class _LecturerQuizScreenState extends State<LecturerQuizScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  List<SnapQuiz> _quizzes = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadQuizzes();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadQuizzes() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final quizzes = await apiService.getQuizzes();
      setState(() {
        _quizzes = quizzes;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _showComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Coming soon')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              'Quiz Management',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            Text(
              'Manage proctored and snap quizzes',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w400,
                color: DiklyColors.textSecondary,
              ),
            ),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Container(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(10),
            ),
            child: TabBar(
              controller: _tabController,
              indicator: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.08),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              dividerColor: Colors.transparent,
              labelColor: DiklyColors.textPrimary,
              unselectedLabelColor: DiklyColors.textSecondary,
              labelStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
              unselectedLabelStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w400,
              ),
              tabs: const [
                Tab(text: 'Proctored Quizzes'),
                Tab(text: 'Snap Quizzes'),
              ],
            ),
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _ProctoredQuizzesTab(onCreateQuiz: _showComingSoon),
          _SnapQuizzesTab(
            quizzes: _quizzes,
            loading: _loading,
            error: _error,
            onRefresh: _loadQuizzes,
            onComingSoon: _showComingSoon,
          ),
        ],
      ),
    );
  }
}

class _ProctoredQuizzesTab extends StatelessWidget {
  final VoidCallback onCreateQuiz;

  const _ProctoredQuizzesTab({required this.onCreateQuiz});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Header row
        Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Proctored Quizzes',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.textPrimary,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Create proctored quizzes and manage questions',
                    style: TextStyle(
                      fontSize: 12,
                      color: DiklyColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            ElevatedButton.icon(
              onPressed: onCreateQuiz,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text(
                'Create Quiz',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
        const SizedBox(height: 32),
        // Empty state
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '📝',
                style: TextStyle(fontSize: 56),
              ),
              const SizedBox(height: 16),
              const Text(
                'No quizzes yet',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Create your first proctored quiz for students',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  color: DiklyColors.textSecondary,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onCreateQuiz,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                icon: const Icon(Icons.add, size: 18),
                label: const Text(
                  '+ Create Quiz',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SnapQuizzesTab extends StatelessWidget {
  final List<SnapQuiz> quizzes;
  final bool loading;
  final String? error;
  final VoidCallback onRefresh;
  final VoidCallback onComingSoon;

  const _SnapQuizzesTab({
    required this.quizzes,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onComingSoon,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Snap Quizzes',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: DiklyColors.textPrimary,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Timed exams with anti-cheat enforcement for the student portal',
                style: TextStyle(
                  fontSize: 12,
                  color: DiklyColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Action buttons row
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _ActionButton(
                  label: '🛡 Quiz Monitor',
                  color: const Color(0xFF06B6D4),
                  onTap: onComingSoon,
                ),
                const SizedBox(width: 10),
                _ActionButton(
                  label: '⏱ Live Proctor Monitor',
                  color: const Color(0xFF7C3AED),
                  onTap: onComingSoon,
                ),
                const SizedBox(width: 10),
                _ActionButton(
                  label: '+ New Snap Quiz',
                  color: Colors.black87,
                  onTap: onComingSoon,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // Content
          if (loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.only(top: 48),
                child: CircularProgressIndicator(),
              ),
            )
          else if (error != null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline,
                      size: 48, color: DiklyColors.error),
                  const SizedBox(height: 12),
                  Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: DiklyColors.textSecondary),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: onRefresh,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            )
          else if (quizzes.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF2FF),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(Icons.quiz_outlined,
                          color: Color(0xFF3F51B5), size: 32),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No snap quizzes yet',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Tap "+ New Snap Quiz" to create your first timed quiz.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ],
                ),
              ),
            )
          else
            Column(
              children: quizzes
                  .map((q) => _QuizCard(quiz: q, onComingSoon: onComingSoon))
                  .toList(),
            ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        elevation: 0,
      ),
      child: Text(
        label,
        style:
            const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _QuizCard extends StatelessWidget {
  final SnapQuiz quiz;
  final VoidCallback onComingSoon;

  const _QuizCard({required this.quiz, required this.onComingSoon});

  @override
  Widget build(BuildContext context) {
    final isArchived = quiz.status == 'archived' || quiz.status == 'closed';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (quiz.courseName != null) ...[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEFF6FF),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    quiz.courseName!,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isArchived
                      ? const Color(0xFFF1F5F9)
                      : const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isArchived
                        ? DiklyColors.border
                        : const Color(0xFF16A34A).withOpacity(0.3),
                  ),
                ),
                child: Text(
                  isArchived ? 'Archived' : 'Active',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isArchived
                        ? DiklyColors.textSecondary
                        : const Color(0xFF16A34A),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            quiz.title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          // Chips row
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (quiz.timeLimit != null)
                _Chip(
                  icon: Icons.timer_outlined,
                  label: '${quiz.timeLimit} min',
                ),
              if (quiz.totalMarks != null)
                _Chip(
                  icon: Icons.description_outlined,
                  label: '${quiz.totalMarks} marks',
                ),
              if (quiz.startTime != null)
                _Chip(
                  icon: Icons.calendar_today_outlined,
                  label:
                      '${_fmt(quiz.startTime!)} – ${quiz.endTime != null ? _fmt(quiz.endTime!) : '?'}',
                ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onComingSoon,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E293B),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.list_alt_outlined, size: 16),
                  label: const Text(
                    'Questions',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onComingSoon,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: DiklyColors.error,
                    side: const BorderSide(color: DiklyColors.error),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                  icon: const Icon(Icons.delete_outline_rounded, size: 16),
                  label: const Text(
                    'Delete',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _fmt(DateTime dt) =>
      '${dt.day}/${dt.month}/${dt.year.toString().substring(2)}';
}

class _Chip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _Chip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: DiklyColors.textSecondary),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
                fontSize: 11,
                color: DiklyColors.textSecondary,
                fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
