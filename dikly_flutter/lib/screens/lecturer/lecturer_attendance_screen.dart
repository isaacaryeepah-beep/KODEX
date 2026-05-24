import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

class LecturerAttendanceScreen extends ConsumerStatefulWidget {
  const LecturerAttendanceScreen({super.key});

  @override
  ConsumerState<LecturerAttendanceScreen> createState() => _LecturerAttendanceScreenState();
}

class _LecturerAttendanceScreenState extends ConsumerState<LecturerAttendanceScreen> {
  List<dynamic> _sessions = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final sessions = await apiService.getAttendanceSessions();
      setState(() { _sessions = sessions; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _sessions.isEmpty
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: const [
                  Icon(Icons.checklist_outlined, size: 48, color: DiklyColors.textSecondary),
                  SizedBox(height: 12),
                  Text('No attendance sessions', style: TextStyle(color: DiklyColors.textSecondary)),
                ]))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _sessions.length,
                  itemBuilder: (_, i) {
                    final s = _sessions[i];
                    final present = s['presentCount'] ?? s['present'] ?? 0;
                    final total = s['totalStudents'] ?? s['total'] ?? 0;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        leading: Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                          child: const Icon(Icons.checklist, color: DiklyColors.primary, size: 20),
                        ),
                        title: Text(s['title']?.toString() ?? s['meetingTitle']?.toString() ?? 'Session', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: Text('$present / $total present', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                        trailing: s['date'] != null
                            ? Text(DateFormat('MMM d').format(DateTime.tryParse(s['date'].toString()) ?? DateTime.now()),
                                style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary))
                            : null,
                      ),
                    );
                  },
                ),
    );
  }
}
