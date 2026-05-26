import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodOverviewProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getHodOverview(),
);

final _pendingApprovalsCountProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getPendingApprovals(),
);

class HodHomeScreen extends ConsumerWidget {
  const HodHomeScreen({super.key});

  static const _accent = Color(0xFF7C3AED);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overviewAsync = ref.watch(_hodOverviewProvider);
    final approvalsAsync = ref.watch(_pendingApprovalsCountProvider);
    final user = ref.watch(authProvider).user;

    final firstName = (user?.name ?? 'HOD').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_hodOverviewProvider);
        ref.invalidate(_pendingApprovalsCountProvider);
      },
      color: _accent,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Greeting
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome back, $firstName',
                      style: GoogleFonts.dmSans(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: DiklyColors.text,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'HOD Portal · $institution',
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              if (deptBadge.isNotEmpty) ...[
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    deptBadge,
                    style: GoogleFonts.dmSans(
                      color: DiklyColors.warning,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 24),

          // Stats grid
          overviewAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(color: _accent),
              ),
            ),
            error: (e, _) => Center(
              child: Column(
                children: [
                  const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                  const SizedBox(height: 12),
                  Text(
                    'Failed to load overview',
                    style: GoogleFonts.dmSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: DiklyColors.text,
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () => ref.invalidate(_hodOverviewProvider),
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
            data: (overview) {
              final deptName = overview['departmentName']?.toString() ?? 'Department';
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.school, size: 15, color: DiklyColors.textLight),
                    const SizedBox(width: 6),
                    Text(
                      deptName,
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textLight,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  Text(
                    'Department Overview',
                    style: GoogleFonts.dmSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.text,
                    ),
                  ),
                  const SizedBox(height: 14),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.4,
                    children: [
                      _StatCard(
                        title: 'Pending Approvals',
                        value: (overview['pendingApprovals'] ?? 0).toString(),
                        icon: Icons.pending_actions_outlined,
                        color: DiklyColors.warning,
                      ),
                      _StatCard(
                        title: 'Total Lecturers',
                        value: (overview['totalLecturers'] ?? 0).toString(),
                        icon: Icons.cast_for_education_outlined,
                        color: DiklyColors.primary,
                      ),
                      _StatCard(
                        title: 'Total Students',
                        value: (overview['totalStudents'] ?? 0).toString(),
                        icon: Icons.people_outlined,
                        color: _accent,
                      ),
                      _StatCard(
                        title: 'Total Courses',
                        value: (overview['totalCourses'] ?? 0).toString(),
                        icon: Icons.book_outlined,
                        color: DiklyColors.success,
                      ),
                    ],
                  ),
                ],
              );
            },
          ),

          const SizedBox(height: 24),

          // Pending approvals banner
          approvalsAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (approvals) {
              if (approvals.isEmpty) return const SizedBox.shrink();
              return GestureDetector(
                onTap: () => context.push('/hod/approvals'),
                child: DiklyCard(
                  border: const Border(
                    left: BorderSide(color: DiklyColors.warning, width: 4),
                  ),
                  color: const Color(0xFFFFFBEB),
                  child: Row(children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: DiklyColors.warning.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.pending_actions, color: DiklyColors.warning, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${approvals.length} Pending Approval${approvals.length == 1 ? '' : 's'}',
                            style: GoogleFonts.dmSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: DiklyColors.warning,
                            ),
                          ),
                          Text(
                            'Tap to review and approve',
                            style: GoogleFonts.dmSans(
                              fontSize: 12,
                              color: DiklyColors.textLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: DiklyColors.warning),
                  ]),
                ),
              );
            },
          ),

          const SizedBox(height: 24),

          // Quick action cards
          Text(
            'Quick Actions',
            style: GoogleFonts.dmSans(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.text,
            ),
          ),
          const SizedBox(height: 14),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 2,
            children: [
              _QuickCard(
                icon: Icons.check_circle_outline,
                label: 'Approvals',
                color: DiklyColors.warning,
                onTap: () => context.push('/hod/approvals'),
              ),
              _QuickCard(
                icon: Icons.book_outlined,
                label: 'Course Approvals',
                color: DiklyColors.primary,
                onTap: () => context.push('/hod/course-approvals'),
              ),
              _QuickCard(
                icon: Icons.lock_outlined,
                label: 'Locked Students',
                color: DiklyColors.error,
                onTap: () => context.push('/hod/locked-students'),
              ),
              _QuickCard(
                icon: Icons.warning_amber_outlined,
                label: 'Smart Alerts',
                color: _accent,
                onTap: () => context.push('/hod/alerts'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(16),
      border: Border(top: BorderSide(color: color, width: 3)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: GoogleFonts.dmSans(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.text,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                title,
                style: GoogleFonts.dmSans(
                  fontSize: 11,
                  color: DiklyColors.textLight,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuickCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickCard({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.dmSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: DiklyColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
