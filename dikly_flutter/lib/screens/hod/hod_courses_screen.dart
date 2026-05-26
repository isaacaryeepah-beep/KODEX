import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

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
  static const _accent = Color(0xFF7C3AED);
  String _filter = 'all';
  static const _filters = ['all', 'active', 'pending', 'inactive'];

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return DiklyColors.success;
      case 'pending':
        return DiklyColors.warning;
      case 'inactive':
        return DiklyColors.textLight;
      default:
        return DiklyColors.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_departmentCoursesProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(color: DiklyColors.text),
        title: Text(
          'Courses',
          style: GoogleFonts.dmSans(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: DiklyColors.text,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: DiklyColors.border),
        ),
      ),
      body: asyncData.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF7C3AED)),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                const SizedBox(height: 12),
                Text(
                  'Failed to load courses',
                  style: GoogleFonts.dmSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.text,
                  ),
                ),
                TextButton.icon(
                  onPressed: () => ref.invalidate(_departmentCoursesProvider),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                ),
              ],
            ),
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
            color: _accent,
            child: Column(
              children: [
                // Filter chips
                Container(
                  color: DiklyColors.surface,
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: _filters.map((f) {
                        final selected = _filter == f;
                        final label = f[0].toUpperCase() + f.substring(1);
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => setState(() => _filter = f),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: selected ? _accent : DiklyColors.background,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: selected ? _accent : DiklyColors.border,
                                ),
                              ),
                              child: Text(
                                label,
                                style: GoogleFonts.dmSans(
                                  fontSize: 12,
                                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                                  color: selected ? Colors.white : DiklyColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
                const Divider(height: 1, color: DiklyColors.border),

                // List or empty
                if (filtered.isEmpty)
                  Expanded(
                    child: DiklyEmptyState(
                      icon: Icons.book_outlined,
                      iconColor: DiklyColors.textLight,
                      iconBg: DiklyColors.background,
                      title: _filter == 'all'
                          ? 'No courses found'
                          : 'No $_filter courses',
                      subtitle: 'Department courses will appear here.',
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final c = filtered[i];
                        final title = c['title']?.toString() ?? 'Untitled';
                        final code = c['code']?.toString() ?? '';
                        final lecturer = c['lecturer']?.toString() ?? 'Unassigned';
                        final enrolled = c['studentsEnrolled'] ?? 0;
                        final status = c['status']?.toString() ?? 'active';
                        final statusColor = _statusColor(status);

                        return DiklyCard(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Code badge
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 5,
                                    ),
                                    decoration: BoxDecoration(
                                      color: _accent.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      code.isNotEmpty ? code : 'N/A',
                                      style: GoogleFonts.dmSans(
                                        fontSize: 12,
                                        color: _accent,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ),
                                  const Spacer(),
                                  // Status badge
                                  DiklyBadge(
                                    label: status[0].toUpperCase() + status.substring(1),
                                    color: statusColor,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Text(
                                title,
                                style: GoogleFonts.dmSans(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: DiklyColors.text,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(children: [
                                const Icon(
                                  Icons.person_outlined,
                                  size: 14,
                                  color: DiklyColors.textLight,
                                ),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    lecturer,
                                    style: GoogleFonts.dmSans(
                                      fontSize: 12,
                                      color: DiklyColors.textLight,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                const Icon(
                                  Icons.people_outlined,
                                  size: 14,
                                  color: DiklyColors.textLight,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '$enrolled enrolled',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 12,
                                    color: DiklyColors.textLight,
                                  ),
                                ),
                              ]),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
