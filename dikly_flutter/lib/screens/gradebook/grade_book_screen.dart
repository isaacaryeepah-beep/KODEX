import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

// Provider for combined course-grade data from the performance endpoint
final _gradeBookProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getPerformance(),
);

class GradeBookScreen extends ConsumerWidget {
  const GradeBookScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_gradeBookProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Grade Book'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_gradeBookProvider),
        ),
        data: (data) {
          // Support both /api/performance/me and /api/transcripts/my shape
          final courses = _parseCourses(data);
          final gpa = data['gpa']?.toString() ??
              data['summary']?['gpa']?.toString();
          final totalCredits = data['totalCredits'] ??
              data['summary']?['totalCredits'];
          final attendancePct = data['attendancePercentage'] ??
              data['attendance']?['percentage'];

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_gradeBookProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                // ── Header ──────────────────────────────────────────────
                const Text(
                  'Grade Book',
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: DiklyColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Academic performance overview',
                  style: TextStyle(fontSize: 14, color: DiklyColors.textLight),
                ),
                const SizedBox(height: 20),

                // ── Summary stats ────────────────────────────────────────
                if (gpa != null || totalCredits != null || attendancePct != null) ...[
                  _SummaryRow(
                    gpa: gpa,
                    totalCredits: totalCredits,
                    attendancePct: attendancePct,
                  ),
                  const SizedBox(height: 20),
                ],

                // ── Course grade list ────────────────────────────────────
                if (courses.isEmpty)
                  DiklyEmptyState(
                    icon: Icons.grade_outlined,
                    title: 'No Grade Data',
                    subtitle: 'Your grade records will appear here once available.',
                  )
                else
                  ...courses.map((c) => _CourseGradeCard(course: c)),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Map<String, dynamic>> _parseCourses(Map<String, dynamic> data) {
    // Handles multiple API shapes
    final raw = data['courses'] ??
        data['records'] ??
        data['grades'] ??
        data['courseGrades'] ??
        data['items'] ??
        [];
    if (raw is List) {
      return raw.cast<Map<String, dynamic>>();
    }
    return [];
  }
}

// ── Summary Row ─────────────────────────────────────────────────────────────

class _SummaryRow extends StatelessWidget {
  final String? gpa;
  final dynamic totalCredits;
  final dynamic attendancePct;

  const _SummaryRow({this.gpa, this.totalCredits, this.attendancePct});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (gpa != null)
          Expanded(
            child: _SummaryCard(
              value: double.tryParse(gpa!) != null
                  ? double.parse(gpa!).toStringAsFixed(2)
                  : gpa!,
              label: 'GPA',
              color: DiklyColors.primary,
            ),
          ),
        if (gpa != null && totalCredits != null) const SizedBox(width: 10),
        if (totalCredits != null)
          Expanded(
            child: _SummaryCard(
              value: '$totalCredits',
              label: 'Credits',
              color: DiklyColors.success,
            ),
          ),
        if ((gpa != null || totalCredits != null) && attendancePct != null)
          const SizedBox(width: 10),
        if (attendancePct != null)
          Expanded(
            child: _SummaryCard(
              value: '${attendancePct.toString()}%',
              label: 'Attendance',
              color: const Color(0xFF0D9488),
            ),
          ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _SummaryCard({
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
      borderRadius: 10,
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textLight,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Course Grade Card ───────────────────────────────────────────────────────

class _CourseGradeCard extends StatelessWidget {
  final Map<String, dynamic> course;
  const _CourseGradeCard({required this.course});

  Color _gradeColor(String? grade) {
    if (grade == null) return DiklyColors.textLight;
    final first = grade[0].toUpperCase();
    return const {
      'A': Color(0xFF16A34A),
      'B': DiklyColors.primary,
      'C': Color(0xFFD97706),
      'D': Color(0xFFEA580C),
      'F': Color(0xFFDC2626),
    }[first] ?? DiklyColors.textLight;
  }

  @override
  Widget build(BuildContext context) {
    final title = course['courseName']?.toString() ??
        course['name']?.toString() ??
        course['course']?['name']?.toString() ??
        'Unknown Course';
    final code = course['courseCode']?.toString() ??
        course['code']?.toString() ??
        course['course']?['code']?.toString();
    final instructor = course['instructorName']?.toString() ??
        course['lecturer']?.toString();
    final grade = course['grade']?.toString();
    final score = course['score'] ?? course['totalScore'];
    final credits = course['credits'];
    final semester = course['semester']?.toString();

    final gradeColor = _gradeColor(grade);

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      borderRadius: 12,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Grade badge column
          if (grade != null) ...[
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: gradeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: gradeColor.withOpacity(0.3)),
              ),
              child: Center(
                child: Text(
                  grade,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: gradeColor,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
          ],
          // Course info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (code != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: DiklyColors.primaryULight,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          code,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: DiklyColors.primary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (semester != null)
                      Text(
                        semester,
                        style: const TextStyle(
                          fontSize: 11,
                          color: DiklyColors.textMuted,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.text,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (instructor != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.person_outline, size: 13, color: DiklyColors.textLight),
                      const SizedBox(width: 4),
                      Text(
                        instructor,
                        style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                      ),
                    ],
                  ),
                ],
                if (score != null || credits != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (score != null) ...[
                        const Icon(Icons.star_outline, size: 13, color: DiklyColors.textLight),
                        const SizedBox(width: 4),
                        Text(
                          '$score%',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: DiklyColors.textSecondary,
                          ),
                        ),
                      ],
                      if (score != null && credits != null) const SizedBox(width: 14),
                      if (credits != null) ...[
                        const Icon(Icons.credit_score_outlined, size: 13, color: DiklyColors.textLight),
                        const SizedBox(width: 4),
                        Text(
                          '$credits credits',
                          style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                        ),
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
