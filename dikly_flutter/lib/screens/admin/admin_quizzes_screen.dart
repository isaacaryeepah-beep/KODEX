import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _adminQuizzesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getAdminQuizzes(),
);

class AdminQuizzesScreen extends ConsumerStatefulWidget {
  const AdminQuizzesScreen({super.key});

  @override
  ConsumerState<AdminQuizzesScreen> createState() => _AdminQuizzesScreenState();
}

class _AdminQuizzesScreenState extends ConsumerState<AdminQuizzesScreen> {
  bool _scanning = false;
  List<String> _duplicateTitles = [];

  Future<void> _scanDuplicates(List<Map<String, dynamic>> quizzes) async {
    setState(() { _scanning = true; _duplicateTitles = []; });
    await Future.delayed(const Duration(milliseconds: 500));
    final titleCount = <String, int>{};
    for (final q in quizzes) {
      final t = q['title']?.toString() ?? '';
      titleCount[t] = (titleCount[t] ?? 0) + 1;
    }
    final dups = titleCount.entries.where((e) => e.value > 1).map((e) => e.key).toList();
    if (mounted) {
      setState(() { _duplicateTitles = dups; _scanning = false; });
      if (dups.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No duplicate quiz titles found.'), backgroundColor: DiklyColors.success),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Found ${dups.length} duplicate title(s): ${dups.join(', ')}'), backgroundColor: DiklyColors.warning),
        );
      }
    }
  }

  Future<void> _deleteQuiz(String quizId, String title) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Quiz'),
        content: Text('Delete "$title"? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await apiService.deleteQuiz(quizId);
      ref.invalidate(_adminQuizzesProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Quiz deleted'), backgroundColor: DiklyColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_adminQuizzesProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Quizzes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_adminQuizzesProvider)),
        data: (quizzes) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_adminQuizzesProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Quizzes',
                subtitle: 'Overview of all quizzes across all lecturers',
              ),

              // Duplicate Quiz Finder
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFBFDBFE)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.content_copy_outlined, size: 18, color: Color(0xFF2563EB)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Duplicate Quiz Finder',
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF1E40AF))),
                          const Text('Find and remove quizzes with the same title',
                              style: TextStyle(fontSize: 11, color: Color(0xFF3B82F6))),
                          if (_duplicateTitles.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text('Duplicates: ${_duplicateTitles.join(', ')}',
                                style: const TextStyle(fontSize: 11, color: Color(0xFFDC2626))),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _scanning ? null : () => _scanDuplicates(quizzes),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        elevation: 0,
                        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      child: _scanning
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Scan for Duplicates'),
                    ),
                  ],
                ),
              ),

              if (quizzes.isEmpty)
                DiklyCard(
                  padding: const EdgeInsets.all(32),
                  child: const Center(
                    child: Text(
                      'No quizzes found.',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                DiklyCard(
                  padding: EdgeInsets.zero,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: IntrinsicWidth(
                      child: Column(
                        children: [
                          // Header
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: const BoxDecoration(
                              color: Color(0xFFF9FAFB),
                              borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
                              border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
                            ),
                            child: const Row(
                              children: [
                                SizedBox(width: 140, child: _Col('TITLE')),
                                SizedBox(width: 100, child: _Col('LECTURER')),
                                SizedBox(width: 80, child: _Col('COURSE')),
                                SizedBox(width: 80, child: _Col('QUESTIONS')),
                                SizedBox(width: 90, child: _Col('SUBMISSIONS')),
                                SizedBox(width: 80, child: _Col('AVG SCORE')),
                                SizedBox(width: 80, child: _Col('STATUS')),
                                SizedBox(width: 120, child: _Col('ACTIONS')),
                              ],
                            ),
                          ),
                          ...quizzes.map((q) => _QuizRow(
                            quiz: q,
                            isDuplicate: _duplicateTitles.contains(q['title']?.toString() ?? ''),
                            onDelete: () => _deleteQuiz(
                              q['_id']?.toString() ?? q['id']?.toString() ?? '',
                              q['title']?.toString() ?? 'Untitled',
                            ),
                          )),
                        ],
                      ),
                    ),
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

class _Col extends StatelessWidget {
  final String text;
  const _Col(this.text);
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.3),
  );
}

class _QuizRow extends StatelessWidget {
  final Map<String, dynamic> quiz;
  final bool isDuplicate;
  final VoidCallback onDelete;

  const _QuizRow({required this.quiz, required this.isDuplicate, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final title = quiz['title']?.toString() ?? 'Untitled';
    final lecturer = (quiz['createdBy'] is Map ? quiz['createdBy']['name'] : quiz['lecturerName'])?.toString() ?? '—';
    final course = (quiz['course'] is Map ? quiz['course']['code'] : quiz['courseCode'])?.toString() ?? '—';
    final stats = (quiz['stats'] as Map?) ?? {};
    final questions = (quiz['questions'] is List
        ? (quiz['questions'] as List).length
        : (stats['totalQuestions'] as num?)?.toInt() ?? (quiz['totalQuestions'] as num?)?.toInt() ?? 0);
    final submissions = (stats['totalAttempts'] as num?)?.toInt() ?? 0;
    final avgScore = (stats['averageScore'] as num?)?.toDouble() ?? 0.0;
    final statusRaw = quiz['status']?.toString() ?? quiz['isActive'] == true ? 'active' : 'closed';

    Color statusColor;
    String statusLabel;
    switch (statusRaw) {
      case 'active':
      case 'open':
        statusColor = DiklyColors.success;
        statusLabel = 'Active';
        break;
      case 'closed':
      case 'inactive':
        statusColor = DiklyColors.error;
        statusLabel = 'Closed';
        break;
      default:
        statusColor = DiklyColors.textLight;
        statusLabel = statusRaw;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: isDuplicate ? const Color(0xFFFFF7ED) : Colors.transparent,
        border: const Border(bottom: BorderSide(color: Color(0xFFE5E7EB), width: 0.5)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 140,
            child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827)), maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          SizedBox(width: 100, child: Text(lecturer, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)), overflow: TextOverflow.ellipsis)),
          SizedBox(width: 80, child: Text(course, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)))),
          SizedBox(width: 80, child: Text('$questions', style: const TextStyle(fontSize: 12, color: Color(0xFF374151)))),
          SizedBox(width: 90, child: Text('$submissions', style: const TextStyle(fontSize: 12, color: Color(0xFF374151)))),
          SizedBox(
            width: 80,
            child: Text(
              submissions > 0 ? '${avgScore.toStringAsFixed(0)}%' : '—',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: avgScore >= 70 ? DiklyColors.success : avgScore >= 50 ? DiklyColors.warning : DiklyColors.error,
              ),
            ),
          ),
          SizedBox(
            width: 80,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
            ),
          ),
          SizedBox(
            width: 120,
            child: Row(
              children: [
                TextButton(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Quiz details coming soon')),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: DiklyColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('View', style: TextStyle(fontSize: 12)),
                ),
                TextButton(
                  onPressed: onDelete,
                  style: TextButton.styleFrom(
                    foregroundColor: DiklyColors.error,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Delete', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
