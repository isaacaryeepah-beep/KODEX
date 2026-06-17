import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class ManagerLeaveScreen extends ConsumerStatefulWidget {
  const ManagerLeaveScreen({super.key});

  @override
  ConsumerState<ManagerLeaveScreen> createState() => _ManagerLeaveScreenState();
}

class _ManagerLeaveScreenState extends ConsumerState<ManagerLeaveScreen> {
  List<dynamic> _requests = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await apiService.getLeaveRequests();
      setState(() { _requests = data; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _approve(String id) async {
    try {
      await apiService.approveLeaveRequest(id);
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Leave request approved'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  Future<void> _reject(String id) async {
    try {
      await apiService.rejectLeaveRequest(id);
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Leave request rejected')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  String _getId(dynamic r) => r['_id']?.toString() ?? r['id']?.toString() ?? '';

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF1D4ED8)));
    }

    final pending = _requests.where((r) => r['status'] == 'pending').toList();
    final approved = _requests.where((r) => r['status'] == 'approved').toList();
    final rejected = _requests.where((r) => r['status'] == 'rejected').toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'Leave Requests',
            subtitle: 'Review and approve employee leave',
          ),

          // ── Pending Approval section ──────────────────────────────────
          _SectionHeader(
            icon: Icons.hourglass_top_outlined,
            iconColor: const Color(0xFFD97706),
            title: 'Pending Approval (${pending.length})',
          ),
          const SizedBox(height: 10),
          if (pending.isEmpty)
            _EmptySection(message: 'No pending requests')
          else
            ...pending.map((r) => _LeaveCard(
              request: r,
              onApprove: () => _approve(_getId(r)),
              onReject: () => _reject(_getId(r)),
            )),

          const SizedBox(height: 20),

          // ── Recently Approved section ─────────────────────────────────
          _SectionHeader(
            icon: Icons.check_circle_outline,
            iconColor: const Color(0xFF059669),
            title: 'Recently Approved',
          ),
          const SizedBox(height: 10),
          if (approved.isEmpty)
            _EmptySection(message: 'No approved leaves yet')
          else
            ...approved.take(5).map((r) => _LeaveCard(request: r)),

          if (rejected.isNotEmpty) ...[
            const SizedBox(height: 20),
            _SectionHeader(
              icon: Icons.cancel_outlined,
              iconColor: const Color(0xFFDC2626),
              title: 'Rejected',
            ),
            const SizedBox(height: 10),
            ...rejected.take(5).map((r) => _LeaveCard(request: r)),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  const _SectionHeader({required this.icon, required this.iconColor, required this.title});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: iconColor),
        const SizedBox(width: 8),
        Text(title,
            style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
      ],
    );
  }
}

class _EmptySection extends StatelessWidget {
  final String message;
  const _EmptySection({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Center(
        child: Text(message,
            style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
      ),
    );
  }
}

class _LeaveCard extends StatelessWidget {
  final dynamic request;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;

  const _LeaveCard({required this.request, this.onApprove, this.onReject});

  Color _statusColor(String s) {
    switch (s.toLowerCase()) {
      case 'approved': return const Color(0xFF059669);
      case 'rejected': return const Color(0xFFDC2626);
      case 'cancelled': return const Color(0xFF6B7280);
      default: return const Color(0xFFD97706);
    }
  }

  String _fmtDate(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    try {
      return DateFormat('MMM d, yyyy').format(DateTime.parse(raw));
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = request as Map<String, dynamic>;
    final employeeName = r['employee']?['name']?.toString() ?? r['employeeName']?.toString() ?? r['name']?.toString() ?? 'Employee';
    final type = r['type']?.toString() ?? 'Leave';
    final status = r['status']?.toString() ?? 'pending';
    final start = _fmtDate(r['startDate']?.toString());
    final end = _fmtDate(r['endDate']?.toString());
    final reason = r['reason']?.toString() ?? '';
    final days = r['days']?.toString() ?? '';
    final statusColor = _statusColor(status);
    final isPending = status == 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(employeeName,
                        style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                    const SizedBox(height: 2),
                    Text(type,
                        style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(status.toUpperCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.calendar_today_outlined, size: 12, color: DiklyColors.textMuted),
              const SizedBox(width: 5),
              Text(
                start == end ? start : '$start → $end',
                style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textSecondary),
              ),
              if (days.isNotEmpty) ...[
                const SizedBox(width: 6),
                Text('· $days day${days == '1' ? '' : 's'}',
                    style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted)),
              ],
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(reason,
                style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
          ],
          if (isPending && onApprove != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onReject,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DiklyColors.error,
                      side: const BorderSide(color: DiklyColors.error),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: Text('Reject', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: onApprove,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF059669),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: Text('Approve', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
