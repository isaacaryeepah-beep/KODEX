import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';

class GradeBookScreen extends ConsumerStatefulWidget {
  const GradeBookScreen({super.key});

  @override
  ConsumerState<GradeBookScreen> createState() => _GradeBookScreenState();
}

class _GradeBookScreenState extends ConsumerState<GradeBookScreen> {
  List<Course> _courses = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final courses = await apiService.getCourses();
      setState(() { _courses = courses; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Grade Book'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  // ── Header ──────────────────────────────────────────────
                  const Text(
                    'Grade Book',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Manage grades across your courses',
                    style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
                  ),
                  const SizedBox(height: 20),

                  // ── Course list ──────────────────────────────────────────
                  if (_courses.isEmpty)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 48),
                        child: Text(
                          'No courses found.',
                          style: TextStyle(fontSize: 14, color: Color(0xFF9CA3AF)),
                        ),
                      ),
                    )
                  else
                    for (final course in _courses)
                      _CourseGradeCard(course: course),
                ],
              ),
            ),
    );
  }
}

class _CourseGradeCard extends StatelessWidget {
  final Course course;
  const _CourseGradeCard({required this.course});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            course.title.toUpperCase(),
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 4),
          Text(
            [if (course.code != null) course.code!, if (course.instructorName != null) course.instructorName!].join(' · '),
            style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              if (course.studentCount != null)
                Text(
                  '${course.studentCount} student${course.studentCount == 1 ? '' : 's'}',
                  style: const TextStyle(fontSize: 13, color: Color(0xFF374151)),
                ),
              const Spacer(),
              ElevatedButton(
                onPressed: () => context.push('/courses/${course.id}'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  elevation: 0,
                ),
                child: const Text('Open →', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
