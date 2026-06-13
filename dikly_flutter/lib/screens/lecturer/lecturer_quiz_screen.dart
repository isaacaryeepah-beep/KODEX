import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../models/quiz.dart';
import '../../widgets/ds/dikly_ds.dart';

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
    _tabController = TabController(length: 2, vsync: this, initialIndex: 1);
    _loadQuizzes();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadQuizzes() async {
    setState(() { _loading = true; _error = null; });
    try {
      final quizzes = await apiService.getQuizzes();
      setState(() {
        _quizzes = quizzes;
        _loading = false;
      });
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
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
      body: Column(
        children: [
          // Tab toggle bar
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            decoration: BoxDecoration(
              color: const Color(0xFFE5E7EB),
              borderRadius: BorderRadius.circular(6),
            ),
            child: TabBar(
              controller: _tabController,
              indicator: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(4),
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
              labelColor: const Color(0xFF111827),
              unselectedLabelColor: const Color(0xFF6B7280),
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              unselectedLabelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w400),
              tabs: const [
                Tab(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.shield_outlined, size: 16),
                      SizedBox(width: 4),
                      Text('Proctored Quizzes'),
                    ],
                  ),
                ),
                Tab(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.bolt, size: 16),
                      SizedBox(width: 4),
                      Text('Snap Quizzes'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _ProctoredTab(onComingSoon: _showComingSoon),
                _SnapQuizzesTab(
                  quizzes: _quizzes,
                  loading: _loading,
                  error: _error,
                  onRefresh: _loadQuizzes,
                  onComingSoon: _showComingSoon,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Proctored Quizzes Tab ─────────────────────────────────────────────────────

class _ProctoredTab extends StatelessWidget {
  final VoidCallback onComingSoon;
  const _ProctoredTab({required this.onComingSoon});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'Proctored Quizzes',
          subtitle: 'Create proctored quizzes and manage questions',
          action: ElevatedButton.icon(
            onPressed: onComingSoon,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
            icon: const Icon(Icons.add, size: 16),
            label: const Text('+ Create Quiz', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ),
        DiklyCard(
          padding: const EdgeInsets.all(48),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('📝', style: TextStyle(fontSize: 48)),
                const SizedBox(height: 12),
                const Text(
                  'No quizzes yet',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Create your first proctored quiz for students',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                ),
                const SizedBox(height: 20),
                DiklyPrimaryButton(
                  label: '+ Create Quiz',
                  fullWidth: false,
                  onPressed: onComingSoon,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ── Snap Quizzes Tab ──────────────────────────────────────────────────────────

class _SnapQuizzesTab extends StatelessWidget {
  final List<SnapQuiz> quizzes;
  final bool loading;
  final String? error;
  final VoidCallback onRefresh;
  final VoidCallback onComingSoon;

  const _SnapQuizzesTab({
    required this.quizzes,
    required this.loading,
    this.error,
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
          DiklyScreenHeader(
            title: 'Snap Quizzes',
            subtitle: 'Timed exams with anti-cheat enforcement for the student portal',
          ),
          // Action buttons row
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onComingSoon,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF06B6D4),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(44),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.shield_outlined, size: 18),
                  label: const Text('Quiz Monitor', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onComingSoon,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF7C3AED),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(44),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.access_time_outlined, size: 18),
                  label: const Text('Live Proctor Monitor', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: ElevatedButton.icon(
              onPressed: onComingSoon,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF111827),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('+ New Snap Quiz', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 16),
          if (loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(),
              ),
            )
          else if (error != null)
            DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_off_rounded, size: 36, color: Color(0xFF9CA3AF)),
                  const SizedBox(height: 10),
                  const Text(
                    'Failed to load quizzes',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                  ),
                  const SizedBox(height: 14),
                  DiklyPrimaryButton(label: 'Retry', fullWidth: false, onPressed: onRefresh),
                ],
              ),
            )
          else if (quizzes.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.only(top: 32),
                child: Text(
                  'No snap quizzes yet',
                  style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
                ),
              ),
            )
          else
            ...quizzes.map((q) => _QuizCard(quiz: q, onComingSoon: onComingSoon)),
        ],
      ),
    );
  }
}

// ── Quiz Card ─────────────────────────────────────────────────────────────────

class _QuizCard extends StatelessWidget {
  final SnapQuiz quiz;
  final VoidCallback onComingSoon;

  const _QuizCard({required this.quiz, required this.onComingSoon});

  String _fmt(DateTime dt) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '${dt.day} ${months[dt.month - 1]} ${dt.year}, $h:$m';
  }

  @override
  Widget build(BuildContext context) {
    final isArchived = quiz.status == 'archived' || quiz.status == 'closed';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  quiz.title,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                ),
              ),
              const SizedBox(width: 8),
              isArchived ? DiklyBadge.archived() : DiklyBadge.active(),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            quiz.courseName ?? 'Mid-Semester',
            style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (quiz.timeLimit != null)
                DiklyInfoChip(icon: Icons.timer_outlined, label: '${quiz.timeLimit} min'),
              if (quiz.totalQuestions != null)
                DiklyInfoChip(icon: Icons.description_outlined, label: '${quiz.totalQuestions} marks'),
              if (quiz.startTime != null)
                DiklyInfoChip(
                  icon: Icons.calendar_today_outlined,
                  label: '${_fmt(quiz.startTime!)} → ${quiz.endTime != null ? _fmt(quiz.endTime!) : '?'}',
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: onComingSoon,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF111827),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    elevation: 0,
                  ),
                  child: const Text('≡ Questions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onComingSoon,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF6B7280),
                    side: const BorderSide(color: Color(0xFFD1D5DB)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  icon: const Icon(Icons.delete_outline, size: 16),
                  label: const Text('Delete', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
