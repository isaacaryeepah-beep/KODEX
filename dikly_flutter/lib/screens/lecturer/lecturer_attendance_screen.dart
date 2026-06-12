import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../widgets/ds/dikly_ds.dart';

class LecturerAttendanceScreen extends ConsumerStatefulWidget {
  const LecturerAttendanceScreen({super.key});

  @override
  ConsumerState<LecturerAttendanceScreen> createState() =>
      _LecturerAttendanceScreenState();
}

class _LecturerAttendanceScreenState
    extends ConsumerState<LecturerAttendanceScreen> {
  List<dynamic> _sessions = [];
  List<Course> _courses = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        apiService.getAttendanceSessions(),
        apiService.getCourses(),
      ]);
      setState(() {
        _sessions = results[0] as List;
        _courses = results[1] as List<Course>;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _onStartSession() {
    String? selectedCourseId;
    bool starting = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: DiklyColors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('Start Session', style: TextStyle(fontWeight: FontWeight.w700, color: DiklyColors.text)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Select a course to start an attendance session.', style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                dropdownColor: DiklyColors.surface,
                decoration: const InputDecoration(
                  labelText: 'Course',
                  labelStyle: TextStyle(color: DiklyColors.textSecondary),
                  border: OutlineInputBorder(),
                ),
                hint: const Text('Select course', style: TextStyle(color: DiklyColors.textMuted)),
                items: _courses.map((c) => DropdownMenuItem(
                  value: c.id,
                  child: Text(c.title, style: const TextStyle(color: DiklyColors.text, fontSize: 14)),
                )).toList(),
                onChanged: (v) => setDialogState(() => selectedCourseId = v),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.info_outline, size: 14, color: DiklyColors.textMuted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Students mark attendance with the session code.',
                      style: const TextStyle(fontSize: 11, color: DiklyColors.textMuted),
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: starting ? null : () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: (selectedCourseId == null || starting) ? null : () async {
                setDialogState(() => starting = true);
                try {
                  await apiService.startAttendanceSession(courseId: selectedCourseId!);
                  if (ctx.mounted) Navigator.pop(ctx);
                  await _load();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Session started — share the code with students'), backgroundColor: DiklyColors.success),
                    );
                  }
                } catch (e) {
                  setDialogState(() => starting = false);
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
                    );
                  }
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.primary, foregroundColor: Colors.white),
              child: starting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Start'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DiklyScreenHeader(
              title: 'Attendance Sessions',
              subtitle: 'Manage attendance sessions',
            ),

            DiklyPrimaryButton(
              label: 'Start New Session',
              onPressed: _onStartSession,
            ),
            const SizedBox(height: 16),

            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_sessions.isEmpty)
              DiklyCard(
                child: const Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No sessions found', style: TextStyle(fontSize: 14, color: Color(0xFF6B7280))),
                  ),
                ),
              )
            else
              ..._sessions.map((s) => _SessionCard(session: s, onRefresh: _load)),
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends StatefulWidget {
  final dynamic session;
  final VoidCallback onRefresh;
  const _SessionCard({required this.session, required this.onRefresh});

  @override
  State<_SessionCard> createState() => _SessionCardState();
}

class _SessionCardState extends State<_SessionCard> {
  bool _ending = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    final present = s['presentCount'] ?? s['present'] ?? 0;
    final total = s['totalStudents'] ?? s['total'] ?? 0;
    final code = s['code']?.toString() ?? s['sessionCode']?.toString() ?? '';
    final isActive = s['status']?.toString() == 'active' || s['isActive'] == true;
    final title = s['title']?.toString() ?? s['course']?['title']?.toString() ?? 'Session';
    final date = s['createdAt'] != null
        ? DateFormat('MMM d, h:mm a').format(DateTime.tryParse(s['createdAt'].toString()) ?? DateTime.now())
        : '';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: (isActive ? DiklyColors.success : DiklyColors.primary).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.checklist, color: isActive ? DiklyColors.success : DiklyColors.primary, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: DiklyColors.text))),
                        if (isActive)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: DiklyColors.success.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                            child: const Text('LIVE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: DiklyColors.success)),
                          ),
                      ],
                    ),
                    Text('$present / $total present${date.isNotEmpty ? "  ·  $date" : ""}',
                        style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                  ],
                ),
              ),
            ],
          ),
          if (code.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: DiklyColors.primary.withOpacity(0.06),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: DiklyColors.primary.withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.key_rounded, size: 14, color: DiklyColors.primary),
                  const SizedBox(width: 6),
                  Text('Code: ', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                  Text(code, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: DiklyColors.primary, letterSpacing: 2)),
                ],
              ),
            ),
          ],
          if (isActive) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _ending ? null : () async {
                  setState(() => _ending = true);
                  try {
                    final id = s['_id']?.toString() ?? s['id']?.toString() ?? '';
                    await apiService.endAttendanceSession(id);
                    widget.onRefresh();
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
                      );
                    }
                    setState(() => _ending = false);
                  }
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: DiklyColors.error,
                  side: const BorderSide(color: DiklyColors.error),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _ending
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: DiklyColors.error))
                    : const Text('End Session', style: TextStyle(fontSize: 13)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
