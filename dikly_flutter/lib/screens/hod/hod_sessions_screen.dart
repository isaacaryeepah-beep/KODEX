import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _hodSessionsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getHodSessions(),
);

class HodSessionsScreen extends ConsumerWidget {
  const HodSessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_hodSessionsProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Sessions'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load sessions'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_hodSessionsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (sessions) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_hodSessionsProvider),
          child: _HodSessionsBody(sessions: sessions),
        ),
      ),
    );
  }
}

class _HodSessionsBody extends StatelessWidget {
  final List<Map<String, dynamic>> sessions;

  const _HodSessionsBody({required this.sessions});

  String _formatDate(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt = DateTime.parse(raw);
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${dt.day} ${months[dt.month - 1]}';
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'All Sessions',
          subtitle: 'Department-wide attendance sessions — ${sessions.length} total',
        ),
        // Table
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: const BoxDecoration(
                  color: Color(0xFFF9FAFB),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
                  border: Border(bottom: BorderSide(color: DiklyColors.border)),
                ),
                child: const Row(
                  children: [
                    Expanded(flex: 3, child: _HeaderCell('SESSION')),
                    Expanded(flex: 2, child: _HeaderCell('LECTURER')),
                    Expanded(flex: 2, child: _HeaderCell('ATTENDANCE')),
                    Expanded(flex: 2, child: _HeaderCell('DATE')),
                    Expanded(flex: 2, child: _HeaderCell('STATUS')),
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
                ...sessions.asMap().entries.map((e) {
                  final i = e.key;
                  final s = e.value;
                  final status = s['status']?.toString() ?? '';
                  final isActive = ['active', 'live'].contains(status.toLowerCase());
                  final attendance = s['presentCount'] ?? s['attendance'] ?? 0;
                  final total = s['totalStudents'] ?? s['total'];
                  final attendanceStr = total != null ? '$attendance/$total' : '$attendance';

                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: i.isOdd ? const Color(0xFFFAFAFA) : Colors.white,
                      border: i < sessions.length - 1
                          ? const Border(bottom: BorderSide(color: DiklyColors.border))
                          : null,
                      borderRadius: i == sessions.length - 1
                          ? const BorderRadius.vertical(bottom: Radius.circular(10))
                          : null,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: Text(
                            s['title']?.toString() ?? s['name']?.toString() ?? '—',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Text(
                            s['lecturerName']?.toString() ?? s['lecturer']?['name']?.toString() ?? '—',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Text(
                            attendanceStr,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Text(
                            _formatDate(s['startTime']?.toString() ?? s['createdAt']?.toString()),
                            style: const TextStyle(fontSize: 12, color: Color(0xFF374151)),
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: (isActive ? DiklyColors.success : const Color(0xFF6B7280)).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              isActive ? 'Active' : (status.isEmpty ? 'Ended' : _capitalize(status)),
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: isActive ? DiklyColors.success : const Color(0xFF6B7280),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).toLowerCase();
}

class _HeaderCell extends StatelessWidget {
  final String label;
  const _HeaderCell(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: Color(0xFF9CA3AF),
        letterSpacing: 0.5,
      ),
    );
  }
}
