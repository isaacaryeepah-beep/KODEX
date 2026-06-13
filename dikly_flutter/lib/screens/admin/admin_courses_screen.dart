import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminCoursesScreen extends ConsumerStatefulWidget {
  const AdminCoursesScreen({super.key});

  @override
  ConsumerState<AdminCoursesScreen> createState() => _AdminCoursesScreenState();
}

class _AdminCoursesScreenState extends ConsumerState<AdminCoursesScreen> {
  void _showCreateDialog() {
    final titleCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Create Course', style: TextStyle(fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Course Title')),
          const SizedBox(height: 10),
          TextField(controller: codeCtrl, decoration: const InputDecoration(labelText: 'Course Code')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
            onPressed: () async {
              Navigator.pop(context);
              try {
                await apiService.createCourse({'title': titleCtrl.text.trim(), 'code': codeCtrl.text.trim()});
                ref.invalidate(coursesProvider);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Course created!')));
              } catch (e) {
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(coursesProvider)),
        data: (courses) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(coursesProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
            children: [
              DiklyScreenHeader(
                title: 'Courses',
                subtitle: 'Manage academic courses',
                action: ElevatedButton.icon(
                  onPressed: _showCreateDialog,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('+ Create Course', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              if (courses.isEmpty)
                const DiklyEmptyState(
                  icon: Icons.book_outlined,
                  title: 'No courses yet',
                  subtitle: 'Create the first course to get started',
                )
              else
                ...courses.map((c) => _CourseCard(course: c)),
            ],
          ),
        ),
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  const _CourseCard({required this.course});

  static Widget _tag(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(5),
        ),
        child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
      );

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
          Row(
            children: [
              if (course.code != null) _tag(course.code!, const Color(0xFFDC2626)),
              if (course.level != null) ...[const SizedBox(width: 6), _tag('Level ${course.level!}', const Color(0xFF6B7280))],
              if (course.group != null) ...[const SizedBox(width: 6), _tag('Group ${course.group!}', const Color(0xFF6B7280))],
              const Spacer(),
              isApproved ? DiklyBadge.approved() : DiklyBadge.pending(),
            ],
          ),
          const SizedBox(height: 10),

          Text(
            course.title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),

          if (instructor.isNotEmpty) ...[
            Row(
              children: [
                const Icon(Icons.person_outline, size: 14, color: Color(0xFF6B7280)),
                const SizedBox(width: 4),
                Text(instructor, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
              ],
            ),
            const SizedBox(height: 4),
          ],

          Row(
            children: [
              const Icon(Icons.people_outlined, size: 14, color: Color(0xFF6B7280)),
              const SizedBox(width: 4),
              Text('$enrolled students enrolled', style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
            ],
          ),
          const SizedBox(height: 12),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ActionButton(
                label: 'Upload',
                icon: Icons.upload_outlined,
                color: const Color(0xFFDC2626),
                filled: true,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Upload Students — coming soon')),
                ),
              ),
              _ActionButton(
                label: 'Roster',
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
