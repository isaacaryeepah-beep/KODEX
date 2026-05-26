import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminReportsScreen extends StatefulWidget {
  const AdminReportsScreen({super.key});

  @override
  State<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends State<AdminReportsScreen> {
  Map<String, dynamic>? _reports;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await apiService.getReports();
      setState(() { _reports = data; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: DiklyColors.textSecondary)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          DiklyScreenHeader(
            title: 'Reports',
            subtitle: 'Platform-wide statistics',
          ),
          Text(
            'Platform Statistics',
            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
          ),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              _StatTile(label: 'Total Users', value: (_reports?['totalUsers'] ?? '—').toString(), icon: Icons.people_outlined, color: DiklyColors.error),
              _StatTile(label: 'Students', value: (_reports?['totalStudents'] ?? '—').toString(), icon: Icons.school_outlined, color: DiklyColors.primary),
              _StatTile(label: 'Lecturers', value: (_reports?['totalLecturers'] ?? '—').toString(), icon: Icons.cast_for_education_outlined, color: const Color(0xFF7C3AED)),
              _StatTile(label: 'Courses', value: (_reports?['totalCourses'] ?? '—').toString(), icon: Icons.book_outlined, color: DiklyColors.success),
              _StatTile(label: 'Meetings', value: (_reports?['totalMeetings'] ?? '—').toString(), icon: Icons.video_call_outlined, color: DiklyColors.warning),
              _StatTile(label: 'Employees', value: (_reports?['totalEmployees'] ?? '—').toString(), icon: Icons.badge_outlined, color: const Color(0xFF059669)),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatTile({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 18, color: color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
              Text(label, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight, fontWeight: FontWeight.w500)),
            ],
          ),
        ],
      ),
    );
  }
}
