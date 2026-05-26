import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/course.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/error_view.dart';
import '../../widgets/ds/dikly_ds.dart';

class LecturerCoursesScreen extends ConsumerWidget {
  const LecturerCoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(coursesProvider),
        ),
        data: (courses) => _CoursesBody(courses: courses, ref: ref),
      ),
    );
  }
}

class _CoursesBody extends StatelessWidget {
  final List<Course> courses;
  final WidgetRef ref;
  const _CoursesBody({required this.courses, required this.ref});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(coursesProvider),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'Courses',
            subtitle: 'Manage academic courses',
            action: ElevatedButton.icon(
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Create Course — coming soon')),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('+ Create Course', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),

          if (courses.isEmpty)
            const DiklyEmptyState(
              icon: Icons.book_outlined,
              title: 'No courses yet',
              subtitle: 'Create your first course to get started',
            )
          else
            ...courses.map((c) => _CourseCard(course: c)),
        ],
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  const _CourseCard({required this.course});

  @override
  Widget build(BuildContext context) {
    final isApproved = (course.status ?? 'active').toLowerCase() == 'approved' ||
        (course.status ?? 'active').toLowerCase() == 'active';
    final enrolled = course.studentCount ?? 0;
    final instructor = course.instructorName ?? '';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Course code + title row
          Row(
            children: [
              if (course.code != null) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2563EB).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    course.code!,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF2563EB),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  course.title.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),

          if (instructor.isNotEmpty) ...[
            Row(
              children: [
                Text(instructor, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
              ],
            ),
          ],
          const SizedBox(height: 4),

          Row(
            children: [
              const Icon(Icons.people_outlined, size: 14, color: Color(0xFF6B7280)),
              const SizedBox(width: 4),
              Text('$enrolled enrolled', style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
            ],
          ),
          const SizedBox(height: 10),

          isApproved ? DiklyBadge.approved() : DiklyBadge.pending(),
          const SizedBox(height: 14),

          // Action buttons
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ActionButton(
                label: 'Upload Students',
                icon: Icons.upload_outlined,
                color: const Color(0xFF2563EB),
                filled: true,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Upload Students — coming soon')),
                ),
              ),
              _ActionButton(
                label: 'View Roster',
                icon: Icons.people_outline,
                color: const Color(0xFF6B7280),
                filled: false,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('View Roster — coming soon')),
                ),
              ),
              _ActionButton(
                label: 'Email',
                icon: Icons.email_outlined,
                color: const Color(0xFF7C3AED),
                filled: false,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Email — coming soon')),
                ),
              ),
              _ActionButton(
                label: 'SMS',
                icon: Icons.sms_outlined,
                color: const Color(0xFF16A34A),
                filled: false,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('SMS — coming soon')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool filled;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.filled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: filled ? color : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: filled ? color : const Color(0xFFE5E7EB)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: filled ? Colors.white : color),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: filled ? Colors.white : color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
