import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class LeaveRequestsScreen extends StatefulWidget {
  const LeaveRequestsScreen({super.key});

  @override
  State<LeaveRequestsScreen> createState() => _LeaveRequestsScreenState();
}

class _LeaveRequestsScreenState extends State<LeaveRequestsScreen> {
  List<dynamic> _requests = [];
  bool _loading = true;
  String? _error;
  // Filter: All | Pending | Approved | Rejected
  int _filterIndex = 0;
  static const _filters = ['All', 'Pending', 'Approved', 'Rejected'];

  @override
  void initState() {
    super.initState();
    _loadData();
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

  List<dynamic> get _filtered {
    switch (_filterIndex) {
      case 1: return _requests.where((r) => (r as Map)['status'] == 'pending').toList();
      case 2: return _requests.where((r) => (r as Map)['status'] == 'approved').toList();
      case 3: return _requests.where((r) => (r as Map)['status'] == 'rejected').toList();
      default: return _requests;
    }
  }

  List<dynamic> get _pending => _requests.where((r) => (r as Map)['status'] == 'pending').toList();
  List<dynamic> get _approved => _requests.where((r) => (r as Map)['status'] == 'approved').toList();
  List<dynamic> get _rejected => _requests.where((r) => (r as Map)['status'] == 'rejected').toList();

  Future<void> _approve(String id) async {
    try {
      await apiService.approveLeaveRequest(id);
      await _loadData();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Leave approved'), backgroundColor: DiklyColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
      );
    }
  }

  Future<void> _reject(String id) async {
    try {
      await apiService.rejectLeaveRequest(id);
      await _loadData();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Leave rejected'), backgroundColor: DiklyColors.warning),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: Column(
        children: [
          // Header + filter tabs
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklyScreenHeader(
                  title: 'Leave Requests',
                  subtitle: '${_pending.length} pending · ${_approved.length} approved · ${_rejected.length} rejected',
                  padding: const EdgeInsets.only(bottom: 12),
                ),
                // Filter tabs
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: List.generate(_filters.length, (i) {
                      final selected = _filterIndex == i;
                      final count = i == 0
                          ? _requests.length
                          : i == 1
                              ? _pending.length
                              : i == 2
                                  ? _approved.length
                                  : _rejected.length;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8, bottom: 12),
                        child: GestureDetector(
                          onTap: () => setState(() => _filterIndex = i),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                            decoration: BoxDecoration(
                              color: selected ? DiklyColors.primary : DiklyColors.background,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: selected ? DiklyColors.primary : DiklyColors.border,
                              ),
                            ),
                            child: Text(
                              '${_filters[i]} ($count)',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: selected ? Colors.white : DiklyColors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                            const SizedBox(height: 12),
                            Text(_error!),
                            const SizedBox(height: 16),
                            ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : _filtered.isEmpty
                        ? const DiklyEmptyState(
                            icon: Icons.event_note_outlined,
                            title: 'No leave requests',
                            message: 'Leave requests will appear here',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) {
                                final req = _filtered[index] as Map<String, dynamic>;
                                final id = req['_id']?.toString() ?? req['id']?.toString() ?? '';
                                final name = (req['user'] is Map ? req['user']['name'] : req['userName'])?.toString() ?? 'Unknown';
                                final type = req['leaveType']?.toString() ?? req['type']?.toString() ?? 'Leave';
                                final startDate = req['startDate'] != null ? DateTime.tryParse(req['startDate'].toString()) : null;
                                final endDate = req['endDate'] != null ? DateTime.tryParse(req['endDate'].toString()) : null;
                                final reason = req['reason']?.toString() ?? '';
                                final status = req['status']?.toString() ?? 'pending';
                                final isPending = status == 'pending';

                                Color statusColor;
                                switch (status) {
                                  case 'approved': statusColor = DiklyColors.success; break;
                                  case 'rejected': statusColor = DiklyColors.error; break;
                                  default: statusColor = DiklyColors.warning;
                                }

                                return DiklyCard(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          CircleAvatar(
                                            radius: 20,
                                            backgroundColor: DiklyColors.primary.withOpacity(0.1),
                                            child: Text(
                                              name.isNotEmpty ? name[0].toUpperCase() : '?',
                                              style: const TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w700,
                                                color: DiklyColors.primary,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  name,
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 14,
                                                    color: DiklyColors.textPrimary,
                                                  ),
                                                ),
                                                // Leave type chip
                                                const SizedBox(height: 3),
                                                Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                                  decoration: BoxDecoration(
                                                    color: DiklyColors.primary.withOpacity(0.08),
                                                    borderRadius: BorderRadius.circular(20),
                                                  ),
                                                  child: Text(
                                                    type,
                                                    style: const TextStyle(
                                                      fontSize: 11,
                                                      fontWeight: FontWeight.w600,
                                                      color: DiklyColors.primary,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          DiklyBadge(
                                            label: status.toUpperCase(),
                                            color: statusColor,
                                          ),
                                        ],
                                      ),
                                      if (startDate != null || endDate != null) ...[
                                        const SizedBox(height: 10),
                                        Row(
                                          children: [
                                            const Icon(Icons.calendar_today_outlined, size: 14, color: DiklyColors.textSecondary),
                                            const SizedBox(width: 6),
                                            Text(
                                              '${startDate != null ? DateFormat('MMM d').format(startDate) : 'N/A'} — ${endDate != null ? DateFormat('MMM d, yyyy').format(endDate) : 'N/A'}',
                                              style: const TextStyle(
                                                fontSize: 13,
                                                color: DiklyColors.textSecondary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                      if (reason.isNotEmpty) ...[
                                        const SizedBox(height: 6),
                                        Text(
                                          reason,
                                          style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                      // Approve / Reject buttons for pending
                                      if (isPending && id.isNotEmpty) ...[
                                        const SizedBox(height: 12),
                                        const Divider(height: 1),
                                        const SizedBox(height: 12),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: OutlinedButton(
                                                onPressed: () => _reject(id),
                                                style: OutlinedButton.styleFrom(
                                                  foregroundColor: DiklyColors.error,
                                                  side: const BorderSide(color: DiklyColors.error),
                                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                                ),
                                                child: const Text('Reject', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: ElevatedButton(
                                                onPressed: () => _approve(id),
                                                style: ElevatedButton.styleFrom(
                                                  backgroundColor: DiklyColors.success,
                                                  foregroundColor: Colors.white,
                                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                                  elevation: 0,
                                                ),
                                                child: const Text('Approve', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
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
                          ),
          ),
        ],
      ),
    );
  }
}
