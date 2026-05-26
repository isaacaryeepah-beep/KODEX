import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/error_view.dart';

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
          // Header row
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'Courses',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Manage academic courses',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ],
                ),
              ),
              ElevatedButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Create Course — coming soon')),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Create Course', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (courses.isEmpty)
            _EmptyState()
          else
            ...courses.map((c) => _CourseCard(course: c, context: context)),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 60),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: DiklyColors.primary.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.book_outlined, size: 36, color: DiklyColors.primary),
          ),
          const SizedBox(height: 16),
          const Text(
            'No courses yet',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 6),
          const Text(
            'Create your first course to get started',
            style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  final BuildContext context;
  const _CourseCard({required this.course, required this.context});

  @override
  Widget build(BuildContext context) {
    final isApproved = (course.status ?? 'active').toLowerCase() == 'approved' ||
        (course.status ?? 'active').toLowerCase() == 'active';
    final enrolled = course.studentCount ?? 0;
    final instructor = course.instructorName ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
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
                    color: DiklyColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    course.code!,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
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
          const SizedBox(height: 8),

          // Instructor + badges row
          Row(
            children: [
              const SizedBox(width: 2),
              if (instructor.isNotEmpty) ...[
                Text(
                  instructor,
                  style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 6),

          // Enrolled count
          Row(
            children: [
              const Icon(Icons.people_outlined, size: 14, color: DiklyColors.textSecondary),
              const SizedBox(width: 4),
              Text(
                '$enrolled enrolled',
                style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Status badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: isApproved
                  ? const Color(0xFFDCFCE7)
                  : const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isApproved ? Icons.check : Icons.schedule,
                  size: 12,
                  color: isApproved ? const Color(0xFF16A34A) : const Color(0xFFD97706),
                ),
                const SizedBox(width: 4),
                Text(
                  isApproved ? 'Approved' : 'Pending',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isApproved ? const Color(0xFF16A34A) : const Color(0xFFD97706),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Action buttons
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ActionButton(
                label: 'Upload Students',
                icon: Icons.upload_outlined,
                color: DiklyColors.primary,
                filled: true,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Upload Students — coming soon')),
                ),
              ),
              _ActionButton(
                label: 'View Roster',
                icon: Icons.people_outline,
                color: DiklyColors.textSecondary,
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
