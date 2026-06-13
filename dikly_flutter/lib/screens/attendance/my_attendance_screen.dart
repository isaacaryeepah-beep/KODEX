import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _myAttendanceProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getMyAttendanceHistory(),
);

class MyAttendanceScreen extends ConsumerWidget {
  const MyAttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_myAttendanceProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('My Attendance'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load attendance history'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_myAttendanceProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (records) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_myAttendanceProvider),
          child: _MyAttendanceBody(records: records),
        ),
      ),
    );
  }
}

class _MyAttendanceBody extends StatelessWidget {
  final List<Map<String, dynamic>> records;

  const _MyAttendanceBody({required this.records});

  static const _methodLabels = {
    'qr_mark': 'QR Code',
    'code_mark': 'code_mark',
    'ble_mark': 'BLE',
    'esp32_ap': 'esp32_ap',
    'jitsi_join': 'Meeting',
    'manual': 'Manual',
    'qr': 'QR Code',
    'ble': 'BLE',
  };

  String _formatCheckIn(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final dt = DateTime.parse(raw);
      return DateFormat('M/d/yyyy, h:mm:ss a').format(dt);
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
          title: 'My Attendance',
          subtitle: 'Your attendance history',
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
                    Expanded(flex: 2, child: _HeaderCell('STATUS')),
                    Expanded(flex: 2, child: _HeaderCell('METHOD')),
                    Expanded(flex: 3, child: _HeaderCell('CHECK-IN TIME')),
                  ],
                ),
              ),
              if (records.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: Center(
                    child: Text(
                      'No attendance records yet.',
                      style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                    ),
                  ),
                )
              else
                ...records.asMap().entries.map((e) {
                  final i = e.key;
                  final r = e.value;
                  final status = r['status']?.toString() ?? '';
                  final method = r['method']?.toString() ?? '';
                  final methodLabel = _methodLabels[method] ?? method;
                  final sessionTitle = (r['session'] as Map?)?['title']?.toString() ?? 'Session';
                  final checkInStr = _formatCheckIn(r['checkInTime']?.toString() ?? r['createdAt']?.toString());
                  final statusColor = status == 'present'
                      ? DiklyColors.success
                      : status == 'late'
                          ? DiklyColors.warning
                          : DiklyColors.error;

                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    decoration: BoxDecoration(
                      color: i.isOdd ? const Color(0xFFFAFAFA) : Colors.white,
                      border: i < records.length - 1
                          ? const Border(bottom: BorderSide(color: DiklyColors.border))
                          : null,
                      borderRadius: i == records.length - 1
                          ? const BorderRadius.vertical(bottom: Radius.circular(10))
                          : null,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: Text(
                            sessionTitle,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFF111827)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: statusColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              status,
                              style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: Text(
                            methodLabel,
                            style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Expanded(
                          flex: 3,
                          child: Text(
                            checkInStr,
                            style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
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
        letterSpacing: 0.4,
      ),
    );
  }
}
