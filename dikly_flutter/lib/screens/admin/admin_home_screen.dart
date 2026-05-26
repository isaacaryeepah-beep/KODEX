import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

class AdminHomeScreen extends ConsumerStatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  ConsumerState<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends ConsumerState<AdminHomeScreen> {
  Map<String, dynamic>? _reports;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await apiService.getReports();
      setState(() { _reports = data; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;

    final firstName = (user?.name ?? 'Admin').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Plain welcome section
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back, $firstName',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      "Here's an overview of your workspace at $institution",
                      style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ),
                  if (deptBadge.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        deptBadge,
                        style: const TextStyle(
                          color: Color(0xFFD97706),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text('Platform Overview', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              children: [
                StatCard(title: 'Total Users', value: (_reports?['totalUsers'] ?? '—').toString(), icon: Icons.people_outlined, color: const Color(0xFFDC2626)),
                StatCard(title: 'Active Meetings', value: (_reports?['activeMeetings'] ?? '—').toString(), icon: Icons.video_call_outlined, color: DiklyColors.success),
                StatCard(title: 'Courses', value: (_reports?['totalCourses'] ?? '—').toString(), icon: Icons.book_outlined, color: DiklyColors.primary),
                StatCard(title: 'Lecturers', value: (_reports?['totalLecturers'] ?? '—').toString(), icon: Icons.cast_for_education_outlined, color: const Color(0xFF7C3AED)),
              ],
            ),
        ],
      ),
    );
  }
}

