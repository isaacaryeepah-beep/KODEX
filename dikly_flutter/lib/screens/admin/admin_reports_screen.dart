import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

class AdminReportsScreen extends StatefulWidget {
  const AdminReportsScreen({super.key});

  @override
  State<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends State<AdminReportsScreen> {
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
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Platform Statistics', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  children: [
                    StatCard(title: 'Total Users', value: (_reports?['totalUsers'] ?? '—').toString(), icon: Icons.people_outlined, color: const Color(0xFFDC2626)),
                    StatCard(title: 'Students', value: (_reports?['totalStudents'] ?? '—').toString(), icon: Icons.school_outlined, color: DiklyColors.primary),
                    StatCard(title: 'Lecturers', value: (_reports?['totalLecturers'] ?? '—').toString(), icon: Icons.cast_for_education_outlined, color: const Color(0xFF7C3AED)),
                    StatCard(title: 'Courses', value: (_reports?['totalCourses'] ?? '—').toString(), icon: Icons.book_outlined, color: DiklyColors.success),
                    StatCard(title: 'Meetings', value: (_reports?['totalMeetings'] ?? '—').toString(), icon: Icons.video_call_outlined, color: DiklyColors.warning),
                    StatCard(title: 'Employees', value: (_reports?['totalEmployees'] ?? '—').toString(), icon: Icons.badge_outlined, color: const Color(0xFF059669)),
                  ],
                ),
              ],
            ),
    );
  }
}
