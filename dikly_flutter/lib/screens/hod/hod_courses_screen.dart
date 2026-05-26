import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _departmentCoursesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getDepartmentCourses(),
    );

class HodCoursesScreen extends ConsumerStatefulWidget {
  const HodCoursesScreen({super.key});

  @override
  ConsumerState<HodCoursesScreen> createState() => _HodCoursesScreenState();
}

class _HodCoursesScreenState extends ConsumerState<HodCoursesScreen> {
  static const _color = Color(0xFF7C2D12);
  String _filter = 'all';
  static const _filters = ['all', 'active', 'pending', 'inactive'];

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return DiklyColors.success;
      case 'pending':
        return DiklyColors.warning;
      case 'inactive':
        return DiklyColors.textSecondary;
      default:
        return DiklyColors.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_departmentCoursesProvider);

    return asyncData.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            Text(
              'Failed to load courses',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            TextButton(
              onPressed: () => ref.invalidate(_departmentCoursesProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (courses) {
        final filtered = _filter == 'all'
            ? courses
            : courses
                .where((c) =>
                    (c['status']?.toString().toLowerCase() ?? '') == _filter)
                .toList();

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_departmentCoursesProvider),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: SizedBox(
                  height: 36,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: _filters
                        .map((f) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: FilterChip(
                                label: Text(
                                  f[0].toUpperCase() + f.substring(1),
                                  style: const TextStyle(fontSize: 12),
                                ),
                                selected: _filter == f,
                                onSelected: (_) =>
                                    setState(() => _filter = f),
                                selectedColor: _color.withOpacity(0.15),
                                checkmarkColor: _color,
                              ),
                            ))
                        .toList(),
                  ),
                ),
              ),
              if (filtered.isEmpty)
                Expanded(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.book_outlined,
                          size: 56,
                          color: DiklyColors.textSecondary,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _filter == 'all'
                              ? 'No courses found'
                              : 'No ${_filter} courses',
                          style: const TextStyle(
                            color: DiklyColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final c = filtered[i];
                      final title = c['title']?.toString() ?? 'Untitled';
                      final code = c['code']?.toString() ?? '';
                      final lecturer = c['lecturer']?.toString() ?? 'Unassigned';
                      final enrolled = c['studentsEnrolled'] ?? 0;
                      final status = c['status']?.toString() ?? 'active';
                      final statusColor = _statusColor(status);

                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: _color.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      code.isNotEmpty ? code : 'N/A',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: _color,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ),
                                  const Spacer(),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: statusColor.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Text(
                                      status[0].toUpperCase() +
                                          status.substring(1),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: statusColor,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 6),
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
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 12),
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
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
