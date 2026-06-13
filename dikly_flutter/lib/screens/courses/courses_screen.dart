import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../widgets/app_shell.dart';

import '../../widgets/ds/dikly_ds.dart';

class CoursesScreen extends ConsumerStatefulWidget {
  const CoursesScreen({super.key});

  @override
  ConsumerState<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends ConsumerState<CoursesScreen> {
  List<Course> _courses = [];
  List<Course> _filtered = [];
  bool _loading = true;
  String? _error;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
    _searchController.addListener(_filterCourses);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final courses = await apiService.getCourses();
      setState(() { _courses = courses; _filtered = courses; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _filterCourses() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      _filtered = query.isEmpty
          ? _courses
          : _courses.where((c) =>
              c.title.toLowerCase().contains(query) ||
              (c.code?.toLowerCase().contains(query) ?? false) ||
              (c.instructorName?.toLowerCase().contains(query) ?? false)).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canCreate = user?.role == 'admin' || user?.role == 'hod';

    final isStudent = user?.role == 'student';
    final screenTitle = isStudent ? 'My Courses' : 'Courses';
    final screenSubtitle = isStudent
        ? 'Your enrolled academic courses'
        : '${_courses.length} course${_courses.length == 1 ? '' : 's'} available';

    return AppShell(
      title: screenTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: screenTitle,
              subtitle: screenSubtitle,
              action: canCreate
                  ? ElevatedButton.icon(
                      onPressed: () => _showCreateCourseDialog(context),
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('Create Course'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                        elevation: 0,
                      ),
                    )
                  : null,
            ),
          ),
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search courses...',
                prefixIcon: const Icon(Icons.search_rounded, size: 20),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded, size: 18),
                        onPressed: () => _searchController.clear(),
                      )
                    : null,
                filled: true,
                fillColor: DiklyColors.surface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: DiklyColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: DiklyColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
                ),
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
                    : _filtered.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.school_outlined,
                            title: _searchController.text.isEmpty ? 'No courses found' : 'No matching courses',
                            subtitle: 'Courses will appear here',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) => _CourseCard(
                                course: _filtered[index],
                                onTap: () => context.push('/courses/${_filtered[index].id}'),
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  void _showCreateCourseDialog(BuildContext context) {
    final titleCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create Course'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Course Title')),
            const SizedBox(height: 12),
            TextField(controller: codeCtrl, decoration: const InputDecoration(labelText: 'Course Code')),
            const SizedBox(height: 12),
            TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await apiService.createCourse({
                  'title': titleCtrl.text.trim(),
                  'code': codeCtrl.text.trim(),
                  'description': descCtrl.text.trim(),
                });
                await _loadData();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Course created!'), backgroundColor: DiklyColors.success),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
                  );
                }
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  final VoidCallback onTap;

  const _CourseCard({required this.course, required this.onTap});

  Color get _statusColor {
    switch ((course.status ?? 'active').toLowerCase()) {
      case 'approved':
      case 'active':
        return DiklyColors.success;
      case 'pending':
        return DiklyColors.warning;
      default:
        return DiklyColors.textLight;
    }
  }

  Color get _statusBg {
    switch ((course.status ?? 'active').toLowerCase()) {
      case 'approved':
      case 'active':
        return DiklyColors.successLight;
      case 'pending':
        return DiklyColors.warningLight;
      default:
        return DiklyColors.grey100;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = course.status ?? 'active';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row: code, level, group, status
          Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (course.code != null)
                _Chip(label: course.code!, color: DiklyColors.primary, bg: DiklyColors.primaryULight),
              if (course.level != null && course.level!.isNotEmpty)
                _Chip(label: 'Level ${course.level!}', color: const Color(0xFF0891B2), bg: const Color(0xFFE0F2FE)),
              if (course.group != null && course.group!.isNotEmpty)
                _Chip(label: 'Group ${course.group!}', color: const Color(0xFF6B7280), bg: const Color(0xFFF3F4F6)),
              _Chip(
                label: '✓ ${status[0].toUpperCase()}${status.substring(1)}',
                color: _statusColor,
                bg: _statusBg,
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Title
          Text(
            course.title,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text, height: 1.3),
          ),
          const SizedBox(height: 8),
          // Instructor
          if (course.instructorName != null)
            Row(
              children: [
                const Icon(Icons.person_outline_rounded, size: 14, color: DiklyColors.textLight),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    course.instructorName!,
                    style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          if (course.studentCount != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.people_outline_rounded, size: 14, color: DiklyColors.textLight),
                const SizedBox(width: 4),
                Text(
                  '${course.studentCount} student${course.studentCount == 1 ? '' : 's'} enrolled',
                  style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          // Certificate chip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: const Color(0xFFBBF7D0)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.workspace_premium_outlined, size: 13, color: Color(0xFF16A34A)),
                SizedBox(width: 4),
                Text('Certificate', style: TextStyle(fontSize: 11, color: Color(0xFF16A34A), fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  final Color bg;
  const _Chip({required this.label, required this.color, required this.bg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}
