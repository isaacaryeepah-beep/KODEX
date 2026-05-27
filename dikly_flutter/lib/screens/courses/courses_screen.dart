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

    return AppShell(
      title: 'Courses',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Courses',
              subtitle: '${_courses.length} course${_courses.length == 1 ? '' : 's'} available',
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Code badge (blue pill)
                    if (course.code != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: DiklyColors.primaryULight,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          course.code!.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: DiklyColors.primary,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                    // Title (uppercase)
                    Text(
                      course.title.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.text,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              // Status badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: _statusBg,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status[0].toUpperCase() + status.substring(1),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: _statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Instructor & enrolled count
          Row(
            children: [
              if (course.instructorName != null) ...[
                const Icon(Icons.person_outline_rounded, size: 14, color: DiklyColors.textLight),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    course.instructorName!,
                    style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
              if (course.studentCount != null) ...[
                const Icon(Icons.people_outline_rounded, size: 14, color: DiklyColors.textLight),
                const SizedBox(width: 4),
                Text(
                  '${course.studentCount} enrolled',
                  style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
