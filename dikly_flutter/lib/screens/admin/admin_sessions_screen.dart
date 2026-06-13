import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/attendance.dart';
import '../../widgets/ds/dikly_ds.dart';

final _adminSessionsProvider = FutureProvider.autoDispose<List<AttendanceSession>>(
  (ref) => apiService.getAttendanceSessions(),
);

class AdminSessionsScreen extends ConsumerWidget {
  const AdminSessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_adminSessionsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Sessions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_adminSessionsProvider)),
        data: (sessions) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_adminSessionsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Attendance Sessions',
                subtitle: 'Manage attendance sessions',
              ),
              DiklyCard(
                padding: EdgeInsets.zero,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: IntrinsicWidth(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: const BoxDecoration(
                            color: Color(0xFFF9FAFB),
                            border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
                          ),
                          child: const Row(
                            children: [
                              SizedBox(width: 140, child: Text('TITLE', style: _headerStyle)),
                              SizedBox(width: 120, child: Text('STATUS', style: _headerStyle)),
                              SizedBox(width: 160, child: Text('STARTED', style: _headerStyle)),
                              SizedBox(width: 160, child: Text('STOPPED', style: _headerStyle)),
                              SizedBox(width: 80, child: Text('ACTIONS', style: _headerStyle)),
                            ],
                          ),
                        ),
                        if (sessions.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 32),
                            child: Center(
                              child: Text(
                                'No sessions yet.',
                                style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                              ),
                            ),
                          )
                        else
                          ...sessions.map((s) => _SessionRow(session: s)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _headerStyle = TextStyle(
  fontSize: 10,
  fontWeight: FontWeight.w700,
  color: Color(0xFF9CA3AF),
  letterSpacing: 0.5,
);

class _SessionRow extends StatelessWidget {
  final AttendanceSession session;
  const _SessionRow({required this.session});

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'stopped': return const Color(0xFFDC2626);
      case 'active':
      case 'open': return DiklyColors.success;
      case 'device_disconnected': return const Color(0xFFD97706);
      default: return const Color(0xFF6B7280);
    }
  }

  String _formatDt(DateTime? dt) {
    if (dt == null) return '—';
    final local = dt.toLocal();
    final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final min = local.minute.toString().padLeft(2, '0');
    final sec = local.second.toString().padLeft(2, '0');
    final ampm = local.hour >= 12 ? 'PM' : 'AM';
    return '${local.month}/${local.day}/${local.year}, $h:$min:$sec $ampm';
  }

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(session.status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB), width: 0.5))),
      child: Row(
        children: [
          SizedBox(
            width: 140,
            child: Text(session.title.isEmpty ? '—' : session.title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827)), overflow: TextOverflow.ellipsis),
          ),
          SizedBox(
            width: 120,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
              child: Text(
                session.status.replaceAll('_', ' '),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
              ),
            ),
          ),
          SizedBox(width: 160, child: Text(_formatDt(session.startTime), style: const TextStyle(fontSize: 11, color: Color(0xFF374151)))),
          SizedBox(width: 160, child: Text(_formatDt(session.endTime), style: const TextStyle(fontSize: 11, color: Color(0xFF374151)))),
          const SizedBox(width: 80, child: Text('—', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)))),
        ],
      ),
    );
  }
}
