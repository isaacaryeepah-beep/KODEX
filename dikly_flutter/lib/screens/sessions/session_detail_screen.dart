import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/meeting.dart';

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
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header Card
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
              borderRadius: BorderRadius.circular(16),
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
                Text(m.title, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(m.meetingType.replaceAll('_', ' ').toUpperCase(), style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12, letterSpacing: 1)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // Details
          _InfoCard(title: 'Session Info', children: [
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
          ]),
          const SizedBox(height: 16),
          // Actions
          if (m.isLive)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _joinMeeting,
                icon: const Icon(Icons.video_call_rounded),
                label: const Text('Join Session'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.success,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          if (canManage && m.isScheduled) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () async {
                  await apiService.startMeeting(m.id);
                  await _loadData();
                },
                icon: const Icon(Icons.play_arrow_rounded),
                label: const Text('Start Session'),
                style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success, padding: const EdgeInsets.symmetric(vertical: 14)),
              ),
            ),
          ],
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
                ),
              ),
            ),
          ],
          if (_attendance.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('Attendance (${_attendance.length})', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final record in _attendance)
              _AttendanceRow(record: record as Map<String, dynamic>),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _InfoCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          ...children,
        ],
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
            width: 120,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
          ),
          Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}

class _AttendanceRow extends StatelessWidget {
  final Map<String, dynamic> record;

  const _AttendanceRow({required this.record});

  @override
  Widget build(BuildContext context) {
    final name = record['userName']?.toString() ?? record['name']?.toString() ?? 'Unknown';
    final status = record['status']?.toString() ?? 'present';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: DiklyColors.primary.withOpacity(0.1),
            child: Text(name[0].toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: DiklyColors.primary)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: DiklyColors.success.withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(status.toUpperCase(), style: const TextStyle(fontSize: 10, color: DiklyColors.success, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
