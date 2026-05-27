import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/attendance.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/ds/empty_state.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  List<AttendanceSession> _sessions = [];
  bool _loading = true;
  String? _error;
  final _codeController = TextEditingController();
  bool _markingAttendance = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final sessions = await apiService.getAttendanceSessions();
      setState(() { _sessions = sessions; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _markAttendance() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter the attendance code'), backgroundColor: DiklyColors.error),
      );
      return;
    }
    setState(() => _markingAttendance = true);
    try {
      await apiService.markAttendance(code);
      _codeController.clear();
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Attendance marked successfully!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAttendance = false);
    }
  }

  void _showMarkAttendanceDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.fact_check_rounded, color: DiklyColors.primary, size: 24),
                  const SizedBox(width: 10),
                  Text('Mark Attendance', style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.pop(ctx),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text('Enter the attendance code provided by your lecturer', style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary)),
              const SizedBox(height: 16),
              TextField(
                controller: _codeController,
                autofocus: true,
                textCapitalization: TextCapitalization.characters,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 6),
                textAlign: TextAlign.center,
                decoration: const InputDecoration(
                  hintText: 'CODE',
                  hintStyle: TextStyle(letterSpacing: 6, color: DiklyColors.textSecondary),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _markingAttendance
                      ? null
                      : () {
                          Navigator.pop(ctx);
                          _markAttendance();
                        },
                  child: _markingAttendance
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Submit Code'),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isLecturer = user?.role == 'lecturer';

    return AppShell(
      title: 'Attendance',
      floatingActionButton: !isLecturer
          ? FloatingActionButton.extended(
              onPressed: _showMarkAttendanceDialog,
              icon: const Icon(Icons.fact_check_rounded),
              label: const Text('Mark Attendance'),
            )
          : null,
      child: _loading
          ? const LoadingList()
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    Text(_error!),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                  ],
                ))
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: _sessions.isEmpty
                      ? DiklyEmptyState(
                          icon: Icons.fact_check_outlined,
                          title: 'No attendance sessions',
                          subtitle: 'Attendance sessions will appear here',
                          buttonLabel: isLecturer ? null : 'Mark Attendance',
                          onButton: isLecturer ? null : _showMarkAttendanceDialog,
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _sessions.length,
                          itemBuilder: (context, index) {
                            final session = _sessions[index];
                            return _AttendanceSessionCard(
                              session: session,
                              isLecturer: isLecturer,
                              onMark: _showMarkAttendanceDialog,
                            );
                          },
                        ),
                ),
    );
  }
}

class _AttendanceSessionCard extends StatelessWidget {
  final AttendanceSession session;
  final bool isLecturer;
  final VoidCallback onMark;

  const _AttendanceSessionCard({required this.session, required this.isLecturer, required this.onMark});

  @override
  Widget build(BuildContext context) {
    final statusColor = session.isOpen ? DiklyColors.success : DiklyColors.textSecondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: session.isOpen ? DiklyColors.success.withOpacity(0.3) : DiklyColors.border,
        ),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(session.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: statusColor.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (session.isOpen)
                      Container(width: 6, height: 6, margin: const EdgeInsets.only(right: 4), decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                    Text(session.isOpen ? 'Open' : 'Closed', style: TextStyle(fontSize: 11, color: statusColor, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (session.courseName != null) ...[
            Row(
              children: [
                const Icon(Icons.school_outlined, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(session.courseName!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
            const SizedBox(height: 4),
          ],
          if (session.startTime != null)
            Row(
              children: [
                const Icon(Icons.schedule_outlined, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(DateFormat('MMM d, h:mm a').format(session.startTime!), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
          if (isLecturer && session.presentCount != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.people_outline, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text('${session.presentCount}/${session.totalStudents ?? '?'} present', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
            if (session.code != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: DiklyColors.primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.key_rounded, size: 14, color: DiklyColors.primary),
                    const SizedBox(width: 6),
                    Text('Code: ${session.code}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.primary, letterSpacing: 2)),
                  ],
                ),
              ),
            ],
          ],
          if (!isLecturer && session.isOpen && !session.isMarked) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onMark,
                icon: const Icon(Icons.fact_check_rounded, size: 16),
                label: const Text('Mark Attendance'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.success,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                ),
              ),
            ),
          ],
          if (!isLecturer && session.isMarked)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: DiklyColors.success.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle_outline_rounded, size: 14, color: DiklyColors.success),
                  SizedBox(width: 6),
                  Text('Attendance marked', style: TextStyle(fontSize: 12, color: DiklyColors.success, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
