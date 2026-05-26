import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

  void _onStartSession() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.devices_other, size: 30, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 16),
            const Text(
              'Device Not Paired',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
            ),
            const SizedBox(height: 8),
            const Text(
              "You haven't paired a classroom device yet.\nOpen Attendance Device, generate a pairing code, and enter it on your ESP32.",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.5),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Color(0xFFE5E7EB)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Cancel', style: TextStyle(color: Color(0xFF6B7280))),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                      context.push('/lecturer/attendance-device');
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: DiklyColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: const Text('Open Pairing'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () {
                    Navigator.pop(context);
                    _load();
                  },
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFFE5E7EB)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.refresh, size: 14, color: Color(0xFF6B7280)),
                      SizedBox(width: 4),
                      Text('Retry', style: TextStyle(color: Color(0xFF6B7280))),
                    ],
                  ),
                ),
              ],
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
            // Header
            Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Attendance Sessions',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Manage attendance sessions',
                        style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Start New Session button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _onStartSession,
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: const Text(
                  'Start New Session',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Sessions list
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
            else if (_sessions.isEmpty)
              Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Center(
                  child: Text(
                    'No sessions found',
                    style: TextStyle(fontSize: 14, color: DiklyColors.textSecondary),
                  ),
                ),
              )
            else
              ...(_sessions.map((s) => _SessionCard(session: s))),
          ],
        ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final dynamic session;
  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final present = session['presentCount'] ?? session['present'] ?? 0;
    final total = session['totalStudents'] ?? session['total'] ?? 0;
    final title = session['title']?.toString() ?? session['meetingTitle']?.toString() ?? 'Session';
    final date = session['date'] != null
        ? DateFormat('MMM d, yyyy').format(DateTime.tryParse(session['date'].toString()) ?? DateTime.now())
        : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: DiklyColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.checklist, color: DiklyColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFF111827))),
                Text('$present / $total present', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
              ],
            ),
          ),
          if (date.isNotEmpty)
            Text(date, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
        ],
      ),
    );
  }
}
