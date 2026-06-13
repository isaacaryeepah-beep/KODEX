import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../widgets/ds/dikly_ds.dart';

final _gradeBookProvider = FutureProvider.autoDispose<List<Course>>(
  (ref) => apiService.getCourses(),
);

class GradeBookScreen extends ConsumerWidget {
  const GradeBookScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_gradeBookProvider);
    final user = ref.watch(currentUserProvider);
    final isAdmin = ['admin', 'superadmin', 'lecturer', 'hod'].contains(user?.role ?? '');
    final title = isAdmin ? 'Grade Book' : 'My Grades';
    final subtitle = isAdmin
        ? 'Manage grades across your courses'
        : 'Your academic performance across all courses';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: Text(title),
        leading: const BackButton(),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_gradeBookProvider),
        ),
        data: (courses) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_gradeBookProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: title,
                subtitle: subtitle,
              ),
              if (courses.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: const Center(
                    child: Text(
                      'No courses enrolled yet.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.9,
                  ),
                  itemCount: courses.length,
                  itemBuilder: (_, i) => _CourseGradeCard(course: courses[i]),
                ),
              const SizedBox(height: 24),
            ],
          ),
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
    final subtitle = [course.code, course.instructorName]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');
    final count = course.studentCount ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            course.title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
          ),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.people_outline, size: 14, color: DiklyColors.textLight),
              const SizedBox(width: 5),
              Text(
                '$count student${count == 1 ? '' : 's'} enrolled',
                style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Grade details coming soon')),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              child: const Text('View Grades →'),
            ),
          ),
        ],
      ),
    );
  }
}
