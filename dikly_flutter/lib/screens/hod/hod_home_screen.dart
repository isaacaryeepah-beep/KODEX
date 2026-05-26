import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

final _hodOverviewProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getHodOverview(),
);

final _pendingApprovalsCountProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getPendingApprovals(),
    );

class HodHomeScreen extends ConsumerWidget {
  const HodHomeScreen({super.key});

  static const _color = Color(0xFF7C2D12);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overviewAsync = ref.watch(_hodOverviewProvider);
    final approvalsAsync = ref.watch(_pendingApprovalsCountProvider);
    final user = ref.watch(authProvider).user;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_hodOverviewProvider);
        ref.invalidate(_pendingApprovalsCountProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _HodWelcomeCard(name: user?.name ?? 'HOD'),
          const SizedBox(height: 20),
          overviewAsync.when(
            loading:
                () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: CircularProgressIndicator(),
                  ),
                ),
            error:
                (e, _) => Center(
                  child: Column(
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 48,
                        color: DiklyColors.error,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Failed to load overview',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      TextButton(
                        onPressed: () => ref.invalidate(_hodOverviewProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
            data: (overview) {
              final deptName =
                  overview['departmentName']?.toString() ?? 'Department';
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(
                      Icons.school,
                      size: 16,
                      color: DiklyColors.textSecondary,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      deptName,
                      style: const TextStyle(
                        fontSize: 13,
                        color: DiklyColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  const Text(
                    'Department Overview',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    children: [
                      StatCard(
                        title: 'Total Lecturers',
                        value:
                            (overview['totalLecturers'] ?? 0).toString(),
                        icon: Icons.cast_for_education_outlined,
                        color: _color,
                      ),
                      StatCard(
                        title: 'Total Students',
                        value:
                            (overview['totalStudents'] ?? 0).toString(),
                        icon: Icons.people_outlined,
                        color: DiklyColors.primary,
                      ),
                      StatCard(
                        title: 'Total Courses',
                        value:
                            (overview['totalCourses'] ?? 0).toString(),
                        icon: Icons.book_outlined,
                        color: DiklyColors.success,
                      ),
                      StatCard(
                        title: 'Active Sessions',
                        value:
                            (overview['activeSessions'] ?? 0).toString(),
                        icon: Icons.videocam_outlined,
                        color: DiklyColors.warning,
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          approvalsAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (approvals) {
              if (approvals.isEmpty) return const SizedBox.shrink();
              return GestureDetector(
                onTap: () => context.push('/hod/approvals'),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: _color.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _color.withOpacity(0.3)),
                  ),
                  child: Row(children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: _color.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.pending_actions,
                        color: _color,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${approvals.length} Pending Approval${approvals.length == 1 ? '' : 's'}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: _color,
                            ),
                          ),
                          const Text(
                            'Tap to review and approve',
                            style: TextStyle(
                              fontSize: 12,
                              color: DiklyColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right,
                      color: _color,
                    ),
                  ]),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _HodWelcomeCard extends StatelessWidget {
  final String name;
  const _HodWelcomeCard({required this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF7C2D12), Color(0xFFB45309)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF7C2D12).withOpacity(0.25),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'HOD Portal',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                name.split(' ').first,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Head of Department',
                style: TextStyle(color: Colors.white60, fontSize: 12),
              ),
            ],
          ),
        ),
        const Icon(
          Icons.account_balance_outlined,
          color: Colors.white60,
          size: 40,
        ),
      ]),
    );
  }
}
