import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _allDepartmentCoursesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getDepartmentCourses(),
    );

class HodCourseApprovalsScreen extends ConsumerStatefulWidget {
  const HodCourseApprovalsScreen({super.key});

  @override
  ConsumerState<HodCourseApprovalsScreen> createState() =>
      _HodCourseApprovalsScreenState();
}

class _HodCourseApprovalsScreenState
    extends ConsumerState<HodCourseApprovalsScreen> {
  static const _color = Color(0xFF7C2D12);
  final Set<String> _processing = {};

  Future<void> _approveCourse(Map<String, dynamic> course) async {
    final id = course['_id']?.toString() ?? course['id']?.toString() ?? '';
    if (id.isEmpty || _processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.approveUser(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${course['title'] ?? 'Course'} approved'),
            backgroundColor: DiklyColors.success,
          ),
        );
        ref.invalidate(_allDepartmentCoursesProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to approve: $e'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  Future<void> _rejectCourse(Map<String, dynamic> course) async {
    final id = course['_id']?.toString() ?? course['id']?.toString() ?? '';
    if (id.isEmpty || _processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.rejectUser(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${course['title'] ?? 'Course'} rejected'),
            backgroundColor: DiklyColors.error,
          ),
        );
        ref.invalidate(_allDepartmentCoursesProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to reject: $e'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_allDepartmentCoursesProvider);
    final user = ref.watch(authProvider).user;
    final dept = user?.department ?? user?.company ?? '';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Course Approvals'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: DiklyColors.error,
              ),
              const SizedBox(height: 12),
              Text(
                'Failed to load courses',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              TextButton(
                onPressed: () => ref.invalidate(_allDepartmentCoursesProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (allCourses) {
          final pending = allCourses
              .where(
                (c) =>
                    (c['status']?.toString().toLowerCase() ?? '') == 'pending',
              )
              .toList();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_allDepartmentCoursesProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: [
                DiklyScreenHeader(
                  title: 'Course Approvals',
                  subtitle: '${pending.length} course${pending.length == 1 ? '' : 's'} awaiting your review · $dept',
                ),
                if (pending.isEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: const Center(
                      child: Text(
                        'No courses pending approval. All caught up!',
                        style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  ...pending.map((course) {
                final id =
                    course['_id']?.toString() ?? course['id']?.toString() ?? '';
                final title = course['title']?.toString() ?? 'Untitled';
                final code = course['code']?.toString() ?? '';
                final lecturer =
                    course['lecturer']?.toString() ?? 'Unassigned';
                final enrolled = course['studentsEnrolled'] ?? 0;
                final isProcessing = _processing.contains(id);

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: _color.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(
                                Icons.book_outlined,
                                color: _color,
                                size: 22,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (code.isNotEmpty)
                                    Container(
                                      margin: const EdgeInsets.only(bottom: 4),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: _color.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        code,
                                        style: const TextStyle(
                                          fontSize: 10,
                                          color: _color,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  Text(
                                    title,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: DiklyColors.warning.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: const Text(
                                'Pending',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: DiklyColors.warning,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(children: [
                          const Icon(
                            Icons.person_outlined,
                            size: 14,
                            color: DiklyColors.textSecondary,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              lecturer,
                              style: const TextStyle(
                                fontSize: 12,
                                color: DiklyColors.textSecondary,
                              ),
                            ),
                          ),
                          const Icon(
                            Icons.people_outlined,
                            size: 14,
                            color: DiklyColors.textSecondary,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '$enrolled enrolled',
                            style: const TextStyle(
                              fontSize: 12,
                              color: DiklyColors.textSecondary,
                            ),
                          ),
                        ]),
                        const SizedBox(height: 14),
                        if (isProcessing)
                          const Center(child: CircularProgressIndicator())
                        else
                          Row(children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => _rejectCourse(course),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: DiklyColors.error,
                                  side: const BorderSide(
                                    color: DiklyColors.error,
                                  ),
                                ),
                                icon: const Icon(Icons.close, size: 16),
                                label: const Text('Reject'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: () => _approveCourse(course),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: DiklyColors.success,
                                  foregroundColor: Colors.white,
                                ),
                                icon: const Icon(Icons.check, size: 16),
                                label: const Text('Approve'),
                              ),
                            ),
                          ]),
                      ],
                    ),
                  ),
                );
              }).toList(),
              ],
            ),
          );
        },
      ),
    );
  }
}
