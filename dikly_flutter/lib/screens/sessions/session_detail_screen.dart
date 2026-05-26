import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';
import '../../widgets/ds/dikly_ds.dart';

class SessionDetailScreen extends ConsumerStatefulWidget {
  final String sessionId;

  const SessionDetailScreen({super.key, required this.sessionId});

  @override
  ConsumerState<SessionDetailScreen> createState() => _SessionDetailScreenState();
}

class _SessionDetailScreenState extends ConsumerState<SessionDetailScreen> {
  Meeting? _meeting;
  List<dynamic> _attendance = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final meeting = await apiService.getMeetingById(widget.sessionId);
      List<dynamic> attendance = [];
      try {
        attendance = await apiService.getMeetingAttendance(widget.sessionId);
      } catch (_) {}
      setState(() { _meeting = meeting; _attendance = attendance; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _joinMeeting() async {
    if (_meeting == null) return;
    try {
      final info = await apiService.joinMeeting(_meeting!.id);
      final url = info['meetingUrl']?.toString() ?? '';
      if (url.isNotEmpty && mounted) {
        context.push('/video-player', extra: {'url': url, 'title': _meeting!.title});
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canManage = user?.role == 'lecturer' || user?.role == 'admin' || user?.role == 'hod';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Session Details'),
        leading: BackButton(onPressed: () => context.pop()),
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: DiklyColors.border, height: 1),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _meeting == null
                  ? const Center(child: Text('Session not found'))
                  : _buildContent(canManage),
    );
  }

  Widget _buildContent(bool canManage) {
    final m = _meeting!;
    final presentCount = _attendance.where((a) => (a as Map<String, dynamic>)['status']?.toString() == 'present').length;
    final absentCount = _attendance.length - presentCount;

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header banner
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: m.isLive
                    ? [DiklyColors.success, const Color(0xFF15803D)]
                    : m.isEnded
                        ? [DiklyColors.textSecondary, const Color(0xFF475569)]
                        : [DiklyColors.primary, DiklyColors.primaryDark],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (m.isLive) ...[
                            Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
                            const SizedBox(width: 4),
                          ],
                          Text(m.statusLabel, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(m.title, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text(
                  m.meetingType.replaceAll('_', ' ').toUpperCase(),
                  style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12, letterSpacing: 1),
                ),
                if (m.scheduledStart != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(Icons.schedule_outlined, size: 14, color: Colors.white.withOpacity(0.8)),
                      const SizedBox(width: 6),
                      Text(
                        DateFormat('EEE, MMM d, yyyy · h:mm a').format(m.scheduledStart!),
                        style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 13),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Stats row: Present / Absent / Total
          if (_attendance.isNotEmpty) ...[
            Row(
              children: [
                _StatBox(value: '$presentCount', label: 'Present', color: DiklyColors.success),
                const SizedBox(width: 12),
                _StatBox(value: '$absentCount', label: 'Absent', color: DiklyColors.error),
                const SizedBox(width: 12),
                _StatBox(value: '${_attendance.length}', label: 'Total', color: DiklyColors.primary),
              ],
            ),
            const SizedBox(height: 16),
          ],

          // Session Info card
          DiklyCard(
            margin: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Session Info', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                const SizedBox(height: 12),
                if (m.scheduledStart != null)
                  _InfoRow(label: 'Scheduled Start', value: DateFormat('EEE, MMM d, yyyy  h:mm a').format(m.scheduledStart!)),
                if (m.scheduledEnd != null)
                  _InfoRow(label: 'Scheduled End', value: DateFormat('EEE, MMM d, yyyy  h:mm a').format(m.scheduledEnd!)),
                if (m.actualStart != null)
                  _InfoRow(label: 'Actual Start', value: DateFormat('EEE, MMM d, yyyy  h:mm a').format(m.actualStart!)),
                if (m.actualEnd != null)
                  _InfoRow(label: 'Actual End', value: DateFormat('EEE, MMM d, yyyy  h:mm a').format(m.actualEnd!)),
                if (m.participantCount != null)
                  _InfoRow(label: 'Participants', value: '${m.participantCount}'),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Actions
          if (m.isLive)
            DiklyPrimaryButton(
              label: 'Join Session',
              icon: Icons.video_call_rounded,
              color: DiklyColors.success,
              onPressed: _joinMeeting,
              height: 50,
            ),
          if (canManage && m.isScheduled)
            DiklyPrimaryButton(
              label: 'Start Session',
              icon: Icons.play_arrow_rounded,
              color: DiklyColors.success,
              onPressed: () async {
                await apiService.startMeeting(m.id);
                await _loadData();
              },
              height: 50,
            ),
          if (canManage && m.isLive) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  await apiService.endMeeting(m.id);
                  await _loadData();
                },
                icon: const Icon(Icons.stop_rounded),
                label: const Text('End Session'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: DiklyColors.error,
                  side: const BorderSide(color: DiklyColors.error),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
          ],

          // Attendance list
          if (_attendance.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              'Attendance (${_attendance.length})',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: DiklyColors.text),
            ),
            const SizedBox(height: 12),
            for (int i = 0; i < _attendance.length; i++)
              _AttendanceRow(
                index: i + 1,
                record: _attendance[i] as Map<String, dynamic>,
              ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _StatBox({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: DiklyColors.textLight)),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text)),
          ),
        ],
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  final int index;
  final Map<String, dynamic> record;

  const _AttendanceRow({required this.index, required this.record});

  @override
  Widget build(BuildContext context) {
    final name = record['userName']?.toString() ?? record['name']?.toString() ?? 'Unknown';
    final status = record['status']?.toString() ?? 'present';
    final isPresent = status.toLowerCase() == 'present';
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').take(2).join()
        : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: [
          // Index
          Text(
            '$index.',
            style: const TextStyle(fontSize: 12, color: DiklyColors.textLight, fontWeight: FontWeight.w500),
          ),
          const SizedBox(width: 10),
          // Avatar
          CircleAvatar(
            radius: 18,
            backgroundColor: DiklyColors.primary.withOpacity(0.1),
            child: Text(
              initials,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: DiklyColors.primary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
            ),
          ),
          // Present/Absent badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: isPresent ? DiklyColors.successLight : DiklyColors.errorLight,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              isPresent ? 'Present' : 'Absent',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: isPresent ? DiklyColors.success : DiklyColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
