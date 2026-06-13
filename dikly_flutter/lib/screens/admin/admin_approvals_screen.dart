import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _approvalsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getPendingApprovals(),
);

class AdminApprovalsScreen extends ConsumerStatefulWidget {
  const AdminApprovalsScreen({super.key});

  @override
  ConsumerState<AdminApprovalsScreen> createState() => _AdminApprovalsScreenState();
}

class _AdminApprovalsScreenState extends ConsumerState<AdminApprovalsScreen> {
  final Set<String> _processing = {};

  Future<void> _approve(String id) async {
    if (_processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.approveUser(id);
      ref.invalidate(_approvalsProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User approved'), backgroundColor: DiklyColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
      );
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  Future<void> _reject(String id) async {
    if (_processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.rejectUser(id);
      ref.invalidate(_approvalsProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User rejected')),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
      );
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_approvalsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Pending Approvals', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_approvalsProvider)),
        data: (approvals) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_approvalsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Pending Approvals',
                subtitle: 'Review and approve employee and manager registration requests',
              ),
              if (approvals.isEmpty)
                DiklyCard(
                  padding: const EdgeInsets.all(32),
                  child: const Center(
                    child: Text(
                      'No pending approval requests — all caught up!',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                ...approvals.map((a) => _ApprovalCard(
                  approval: a,
                  isProcessing: _processing.contains(a['_id']?.toString() ?? a['id']?.toString() ?? ''),
                  onApprove: () => _approve(a['_id']?.toString() ?? a['id']?.toString() ?? ''),
                  onReject: () => _reject(a['_id']?.toString() ?? a['id']?.toString() ?? ''),
                )),
            ],
          ),
        ),
      ),
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  final Map<String, dynamic> approval;
  final bool isProcessing;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _ApprovalCard({
    required this.approval,
    required this.isProcessing,
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final name = approval['name']?.toString() ?? 'Unknown';
    final email = approval['email']?.toString() ?? '';
    final role = approval['role']?.toString() ?? '';
    final dept = approval['department']?.toString() ?? '';
    final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: const Color(0xFF0F172A).withOpacity(0.1),
            child: Text(initials, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Color(0xFF0F172A))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF111827))),
                if (email.isNotEmpty) Text(email, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                if (role.isNotEmpty || dept.isNotEmpty)
                  Text('${role.toUpperCase()}${dept.isNotEmpty ? ' · $dept' : ''}',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280), fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          if (isProcessing)
            const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
          else
            Row(
              children: [
                GestureDetector(
                  onTap: onApprove,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: DiklyColors.success,
                      borderRadius: BorderRadius.circular(7),
                    ),
                    child: const Text('Approve', style: TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: onReject,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(7),
                      border: Border.all(color: const Color(0xFFE5E7EB)),
                    ),
                    child: const Text('Reject', style: TextStyle(fontSize: 12, color: Color(0xFF6B7280), fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
