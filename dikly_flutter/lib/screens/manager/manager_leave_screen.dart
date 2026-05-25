import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/empty_state.dart';

class ManagerLeaveScreen extends ConsumerStatefulWidget {
  const ManagerLeaveScreen({super.key});

  @override
  ConsumerState<ManagerLeaveScreen> createState() => _ManagerLeaveScreenState();
}

class _ManagerLeaveScreenState extends ConsumerState<ManagerLeaveScreen> {
  List<dynamic> _requests = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await apiService.getLeaveRequests();
      setState(() { _requests = data; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _approve(String id) async {
    await apiService.approveLeaveRequest(id);
    _load();
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave request approved')));
  }

  Future<void> _reject(String id) async {
    await apiService.rejectLeaveRequest(id);
    _load();
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave request rejected')));
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _requests.isEmpty
              ? const EmptyState(icon: Icons.event_note_outlined, title: 'No Leave Requests', message: 'No pending leave requests.')
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _requests.length,
                  itemBuilder: (_, i) {
                    final r = _requests[i];
                    final isPending = r['status'] == 'pending';
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(r['employeeName']?.toString() ?? r['name']?.toString() ?? 'Employee',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                            _StatusBadge(status: r['status']?.toString() ?? 'pending'),
                          ]),
                          const SizedBox(height: 4),
                          Text(r['reason']?.toString() ?? r['leaveType']?.toString() ?? '', style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                          if (isPending) ...[
                            const SizedBox(height: 12),
                            Row(children: [
                              Expanded(child: OutlinedButton(
                                onPressed: () => _reject(r['_id']?.toString() ?? r['id']?.toString() ?? ''),
                                style: OutlinedButton.styleFrom(foregroundColor: DiklyColors.error, side: const BorderSide(color: DiklyColors.error)),
                                child: const Text('Reject', style: TextStyle(fontSize: 13)),
                              )),
                              const SizedBox(width: 8),
                              Expanded(child: ElevatedButton(
                                onPressed: () => _approve(r['_id']?.toString() ?? r['id']?.toString() ?? ''),
                                style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success),
                                child: const Text('Approve', style: TextStyle(fontSize: 13)),
                              )),
                            ]),
                          ],
                        ]),
                      ),
                    );
                  },
                ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'approved': color = DiklyColors.success; break;
      case 'rejected': color = DiklyColors.error; break;
      default: color = DiklyColors.warning;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
      child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700)),
    );
  }
}
