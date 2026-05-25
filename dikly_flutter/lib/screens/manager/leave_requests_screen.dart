import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

class LeaveRequestsScreen extends StatefulWidget {
  const LeaveRequestsScreen({super.key});

  @override
  State<LeaveRequestsScreen> createState() => _LeaveRequestsScreenState();
}

class _LeaveRequestsScreenState extends State<LeaveRequestsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<dynamic> _requests = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final requests = await apiService.getLeaveRequests();
      setState(() { _requests = requests; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<dynamic> get _pending => _requests.where((r) => (r as Map)['status'] == 'pending').toList();
  List<dynamic> get _approved => _requests.where((r) => (r as Map)['status'] == 'approved').toList();
  List<dynamic> get _rejected => _requests.where((r) => (r as Map)['status'] == 'rejected').toList();

  Future<void> _approve(String id) async {
    try {
      await apiService.approveLeaveRequest(id);
      await _loadData();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave approved'), backgroundColor: DiklyColors.success));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error));
    }
  }

  Future<void> _reject(String id) async {
    try {
      await apiService.rejectLeaveRequest(id);
      await _loadData();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave rejected'), backgroundColor: DiklyColors.warning));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Leave Requests',
      child: Column(
        children: [
          Container(
            color: DiklyColors.surface,
            child: TabBar(
              controller: _tabController,
              tabs: [
                Tab(text: 'Pending (${_pending.length})'),
                Tab(text: 'Approved (${_approved.length})'),
                Tab(text: 'Rejected'),
              ],
              labelColor: DiklyColors.primary,
              unselectedLabelColor: DiklyColors.textSecondary,
              indicatorColor: DiklyColors.primary,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
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
                    : TabBarView(
                        controller: _tabController,
                        children: [
                          _LeaveList(requests: _pending, onApprove: _approve, onReject: _reject, showActions: true, onRefresh: _loadData),
                          _LeaveList(requests: _approved, onRefresh: _loadData),
                          _LeaveList(requests: _rejected, onRefresh: _loadData),
                        ],
                      ),
          ),
        ],
      ),
    );
  }
}

class _LeaveList extends StatelessWidget {
  final List<dynamic> requests;
  final Future<void> Function(String)? onApprove;
  final Future<void> Function(String)? onReject;
  final Future<void> Function() onRefresh;
  final bool showActions;

  const _LeaveList({
    required this.requests,
    this.onApprove,
    this.onReject,
    required this.onRefresh,
    this.showActions = false,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: requests.isEmpty
          ? const EmptyState(icon: Icons.event_note_outlined, title: 'No leave requests', message: 'Leave requests will appear here')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: requests.length,
              itemBuilder: (context, index) {
                final req = requests[index] as Map<String, dynamic>;
                final id = req['_id']?.toString() ?? req['id']?.toString() ?? '';
                final name = (req['user'] is Map ? req['user']['name'] : req['userName'])?.toString() ?? 'Unknown';
                final type = req['leaveType']?.toString() ?? req['type']?.toString() ?? 'Leave';
                final startDate = req['startDate'] != null ? DateTime.tryParse(req['startDate'].toString()) : null;
                final endDate = req['endDate'] != null ? DateTime.tryParse(req['endDate'].toString()) : null;
                final reason = req['reason']?.toString() ?? '';
                final status = req['status']?.toString() ?? 'pending';

                Color statusColor;
                switch (status) {
                  case 'approved': statusColor = DiklyColors.success; break;
                  case 'rejected': statusColor = DiklyColors.error; break;
                  default: statusColor = DiklyColors.warning;
                }

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: DiklyColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: statusColor.withOpacity(0.2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 18,
                            backgroundColor: DiklyColors.primary.withOpacity(0.1),
                            child: Text(name[0].toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: DiklyColors.primary)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                                Text(type, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                            child: Text(status.toUpperCase(), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: statusColor)),
                          ),
                        ],
                      ),
                      if (startDate != null || endDate != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.calendar_today_outlined, size: 14, color: DiklyColors.textSecondary),
                            const SizedBox(width: 4),
                            Text(
                              '${startDate != null ? DateFormat('MMM d').format(startDate) : 'N/A'} — ${endDate != null ? DateFormat('MMM d, yyyy').format(endDate) : 'N/A'}',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary),
                            ),
                          ],
                        ),
                      ],
                      if (reason.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(reason, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                      ],
                      if (showActions && id.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => onReject?.call(id),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: DiklyColors.error,
                                  side: const BorderSide(color: DiklyColors.error),
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                ),
                                child: const Text('Reject'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: () => onApprove?.call(id),
                                style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.success, padding: const EdgeInsets.symmetric(vertical: 10)),
                                child: const Text('Approve'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
    );
  }
}
