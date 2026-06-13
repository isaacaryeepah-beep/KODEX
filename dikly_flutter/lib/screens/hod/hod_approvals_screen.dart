import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _pendingApprovalsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getPendingApprovals(),
    );

class HodApprovalsScreen extends ConsumerStatefulWidget {
  const HodApprovalsScreen({super.key});

  @override
  ConsumerState<HodApprovalsScreen> createState() => _HodApprovalsScreenState();
}

class _HodApprovalsScreenState extends ConsumerState<HodApprovalsScreen> {
  static const _color = Color(0xFF7C2D12);
  final Set<String> _processing = {};

  String _timeAgo(String? dateStr) {
    if (dateStr == null) return '';
    final dt = DateTime.tryParse(dateStr);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'just now';
  }

  Color _roleColor(String role) {
    switch (role.toLowerCase()) {
      case 'student':
        return DiklyColors.primary;
      case 'lecturer':
        return _color;
      case 'hod':
        return const Color(0xFF7C3AED);
      default:
        return DiklyColors.textSecondary;
    }
  }

  Future<void> _approve(List<Map<String, dynamic>> list, Map<String, dynamic> item) async {
    final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
    if (id.isEmpty || _processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.approveUser(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${item['name'] ?? 'User'} approved'),
            backgroundColor: DiklyColors.success,
          ),
        );
        ref.invalidate(_pendingApprovalsProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to approve: $e'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  Future<void> _reject(List<Map<String, dynamic>> list, Map<String, dynamic> item) async {
    final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
    if (id.isEmpty || _processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.rejectUser(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${item['name'] ?? 'User'} rejected'),
            backgroundColor: DiklyColors.error,
          ),
        );
        ref.invalidate(_pendingApprovalsProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to reject: $e'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_pendingApprovalsProvider);
    final user = ref.watch(authProvider).user;
    final dept = user?.department ?? user?.company ?? '';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Pending Approvals'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              Text(
                'Failed to load approvals',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              TextButton(
                onPressed: () => ref.invalidate(_pendingApprovalsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (approvals) {
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_pendingApprovalsProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: [
                DiklyScreenHeader(
                  title: 'Pending Approvals',
                  subtitleWidget: RichText(
                    text: TextSpan(
                      style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.4),
                      children: [
                        const TextSpan(text: 'Lecturer & student requests for '),
                        TextSpan(text: dept, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
                if (approvals.isEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: const Center(
                      child: Text(
                        'No pending approval requests — all caught up!',
                        style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  ...approvals.map((item) {
                final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
                final name = item['name']?.toString() ?? 'Unknown';
                final email = item['email']?.toString() ?? '';
                final role = item['role']?.toString() ?? 'student';
                final createdAt = item['createdAt']?.toString();
                final isProcessing = _processing.contains(id);
                final roleColor = _roleColor(role);
                final initials = name.isNotEmpty ? name[0].toUpperCase() : 'U';

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          CircleAvatar(
                            radius: 22,
                            backgroundColor: _color.withOpacity(0.12),
                            child: Text(
                              initials,
                              style: const TextStyle(
                                color: _color,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                ),
                                Text(
                                  email,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: DiklyColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (createdAt != null)
                            Text(
                              _timeAgo(createdAt),
                              style: const TextStyle(
                                fontSize: 11,
                                color: DiklyColors.textSecondary,
                              ),
                            ),
                        ]),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: roleColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            role.toUpperCase(),
                            style: TextStyle(
                              fontSize: 10,
                              color: roleColor,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        if (isProcessing)
                          const Center(child: CircularProgressIndicator())
                        else
                          Row(children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () => _reject(approvals, item),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: DiklyColors.error,
                                  side: const BorderSide(
                                    color: DiklyColors.error,
                                  ),
                                ),
                                icon: const Icon(Icons.close, size: 16),
                                label: const Text('Reject'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: () => _approve(approvals, item),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: DiklyColors.success,
                                  foregroundColor: Colors.white,
                                ),
                                icon: const Icon(Icons.check, size: 16),
                                label: const Text('Approve'),
                              ),
                            ),
                          ]),
                      ],
                    ),
                  ),
                );
              }).toList(),
              ],
            ),
          );
        },
      ),
    );
  }
}
