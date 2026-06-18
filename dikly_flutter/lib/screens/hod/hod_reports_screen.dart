import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_file/open_file.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodDeptStatsProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) async {
    final results = await Future.wait([
      apiService.getHodDeptStats(),
      apiService.getHodCourseOverview(),
      apiService.getDepartmentLecturers(),
    ]);
    return {
      'stats': results[0],
      'courseOverview': results[1],
      'lecturers': results[2],
    };
  },
);

class HodReportsScreen extends ConsumerStatefulWidget {
  const HodReportsScreen({super.key});

  @override
  ConsumerState<HodReportsScreen> createState() => _HodReportsScreenState();
}

class _HodReportsScreenState extends ConsumerState<HodReportsScreen> {
  bool _exporting = false;

  Future<void> _exportCsv(String type) async {
    setState(() => _exporting = true);
    try {
      final user = ref.read(authProvider).user;
      final dept = user?.department ?? '';
      final deptParam = dept.isNotEmpty ? '&department=${Uri.encodeComponent(dept)}' : '';

      List<List<String>> rows = [];
      List<String> headers = [];
      String filename = '';

      if (type == 'students') {
        final d = await apiService.get('/api/users?role=student&limit=500$deptParam');
        headers = ['Name', 'Index Number', 'Email', 'Department', 'Status'];
        rows = ((d['users'] as List?) ?? []).map((u) => [
          u['name'] ?? '',
          u['indexNumber'] ?? '',
          u['email'] ?? '',
          u['department'] ?? '',
          (u['isApproved'] == true) ? 'Active' : 'Pending',
        ]).toList();
        filename = 'DIKLY_Students_${dept.isNotEmpty ? dept : 'All'}.csv';
      } else if (type == 'lecturers') {
        final d = await apiService.get('/api/users?role=lecturer&limit=200$deptParam');
        headers = ['Name', 'Email', 'Department', 'Status'];
        rows = ((d['users'] as List?) ?? []).map((u) => [
          u['name'] ?? '',
          u['email'] ?? '',
          u['department'] ?? '',
          (u['isApproved'] == true) ? 'Active' : 'Pending',
        ]).toList();
        filename = 'DIKLY_Lecturers_${dept.isNotEmpty ? dept : 'All'}.csv';
      } else if (type == 'attendance') {
        final d = await apiService.get('/api/attendance-sessions?limit=200$deptParam');
        headers = ['Session', 'Lecturer', 'Date', 'Attendance', 'Status'];
        rows = ((d['sessions'] as List?) ?? []).map((s) => [
          s['title'] ?? s['courseName'] ?? 'Session',
          (s['createdBy'] as Map?)?['name'] ?? '',
          s['createdAt']?.toString().substring(0, 10) ?? '',
          '${s['attendanceCount'] ?? (s['records'] as List?)?.length ?? 0}',
          (s['active'] == true) ? 'Live' : 'Ended',
        ]).toList();
        filename = 'DIKLY_Attendance_${dept.isNotEmpty ? dept : 'All'}.csv';
      } else {
        final d = await apiService.get('/api/hod/course-overview');
        headers = ['Course', 'Code', 'Lecturer', 'Enrolled', 'Sessions (30d)', 'Total Attendance'];
        rows = ((d['courses'] as List?) ?? []).map((c) => [
          c['title'] ?? '',
          c['code'] ?? '',
          (c['lecturer'] as Map?)?['name'] ?? 'Unassigned',
          '${c['enrolled'] ?? 0}',
          '${c['sessions30'] ?? 0}',
          '${c['totalAttendance'] ?? 0}',
        ]).toList();
        filename = 'DIKLY_Courses_${dept.isNotEmpty ? dept : 'All'}.csv';
      }

      final csv = [headers, ...rows]
          .map((r) => r.map((v) => '"${v.replaceAll('"', '""')}"').join(','))
          .join('\n');

      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$filename');
      await file.writeAsString(csv);
      await OpenFile.open(file.path);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  void _showExportSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            const Text('Export Report', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary)),
            const SizedBox(height: 4),
            const Text('Download department data as CSV', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            const SizedBox(height: 16),
            ...[
              ('students', Icons.school_outlined, 'Students CSV'),
              ('lecturers', Icons.person_outlined, 'Lecturers CSV'),
              ('attendance', Icons.sensors_outlined, 'Attendance CSV'),
              ('courses', Icons.menu_book_outlined, 'Courses CSV'),
            ].map((item) => ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              leading: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: DiklyColors.primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(item.$2, size: 18, color: DiklyColors.primary),
              ),
              title: Text(item.$3, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              trailing: const Icon(Icons.download_outlined, size: 18, color: DiklyColors.textSecondary),
              onTap: () {
                Navigator.pop(context);
                _exportCsv(item.$1);
              },
            )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_hodDeptStatsProvider);

    return asyncData.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            Text('Failed to load reports', style: Theme.of(context).textTheme.titleMedium),
            TextButton(onPressed: () => ref.invalidate(_hodDeptStatsProvider), child: const Text('Retry')),
          ],
        ),
      ),
      data: (data) {
        final stats = (data['stats'] as Map<String, dynamic>?) ?? {};
        final courseOverviewData = (data['courseOverview'] as Map<String, dynamic>?) ?? {};
        final lecturers = (data['lecturers'] as List?) ?? [];
        final courses = (courseOverviewData['courses'] as List?)?.cast<Map<String, dynamic>>() ?? [];

        final totalSessions = stats['totalSessions'] ?? 0;
        final totalAttendance = stats['totalAttendance'] ?? 0;
        final avgAttendance = stats['avgAttendance'] ?? 0;
        final lecturerSummary = (stats['lecturerSummary'] as List?)?.cast<Map<String, dynamic>>() ?? [];

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_hodDeptStatsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Department Reports',
                subtitle: 'Attendance and activity overview',
                action: _exporting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : OutlinedButton.icon(
                        onPressed: _showExportSheet,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.primary,
                          side: const BorderSide(color: DiklyColors.primary),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        icon: const Icon(Icons.download_outlined, size: 16),
                        label: const Text('Export', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      ),
              ),

              // 4 stat cards in a row
              Row(
                children: [
                  _StatCard(value: '$totalSessions', label: 'TOTAL SESSIONS', color: const Color(0xFF2563EB)),
                  const SizedBox(width: 8),
                  _StatCard(value: '$totalAttendance', label: 'TOTAL ATTENDANCE', color: const Color(0xFF10B981)),
                  const SizedBox(width: 8),
                  _StatCard(value: '$avgAttendance', label: 'AVG ATTENDANCE', color: const Color(0xFFF59E0B)),
                  const SizedBox(width: 8),
                  _StatCard(value: '${lecturers.length}', label: 'LECTURERS', color: const Color(0xFF7C3AED)),
                ],
              ),
              const SizedBox(height: 20),

              // Attendance Rate by Course
              DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance Rate by Course',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const SizedBox(height: 12),
                    if (courses.isEmpty)
                      const Text('No data yet.', style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)))
                    else
                      ...courses.take(5).map((c) {
                        final title = c['title']?.toString() ?? 'Untitled';
                        final totalAtt = c['totalAttendance'] ?? 0;
                        final sessions30 = c['sessions30'] ?? 0;
                        final enrolled = c['enrolled'] ?? 1;
                        final rate = sessions30 > 0 && enrolled > 0
                          ? ((totalAtt / (sessions30 * enrolled)) * 100).clamp(0, 100).round()
                          : 0;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151)), overflow: TextOverflow.ellipsis)),
                                  Text('$rate%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(3),
                                child: LinearProgressIndicator(
                                  value: rate / 100,
                                  backgroundColor: const Color(0xFFE5E7EB),
                                  valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                                  minHeight: 6,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Attendance by Lecturer
              DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance by Lecturer',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const SizedBox(height: 12),
                    if (lecturerSummary.isEmpty)
                      const Text('No data yet.', style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)))
                    else
                      ...lecturerSummary.take(5).map((l) {
                        final name = l['name']?.toString() ?? 'Unknown';
                        final sessions = l['sessions'] ?? 0;
                        final attendance = l['attendance'] ?? 0;
                        final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 16,
                                backgroundColor: const Color(0xFF7C3AED).withOpacity(0.1),
                                child: Text(initials, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF7C3AED))),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF374151))),
                                    Text('$sessions sessions · $attendance attendance', style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Attendance Trend (Last 30 Days)
              DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Attendance Trend (Last 30 Days)',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const SizedBox(height: 8),
                    if (totalSessions == 0)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No data yet.', style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF))),
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(
                          children: [
                            _TrendStat(label: 'Sessions', value: '$totalSessions', color: const Color(0xFF2563EB)),
                            const SizedBox(width: 16),
                            _TrendStat(label: 'Total Attendees', value: '$totalAttendance', color: const Color(0xFF10B981)),
                            const SizedBox(width: 16),
                            _TrendStat(label: 'Avg per Session', value: '$avgAttendance', color: const Color(0xFFF59E0B)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: DiklyCard(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: color, height: 1)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.3)),
          ],
        ),
      ),
    );
  }
}

class _TrendStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _TrendStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
      ],
    );
  }
}
