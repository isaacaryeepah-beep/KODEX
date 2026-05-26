import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
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
  static const _accent = Color(0xFF7C3AED);
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
        return _accent;
      case 'hod':
        return DiklyColors.error;
      default:
        return DiklyColors.textLight;
    }
  }

  Future<void> _approve(Map<String, dynamic> item) async {
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

  Future<void> _reject(Map<String, dynamic> item) async {
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

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(color: DiklyColors.text),
        title: Text(
          'Pending Approvals',
          style: GoogleFonts.dmSans(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: DiklyColors.text,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: DiklyColors.border),
        ),
      ),
      body: asyncData.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: Color(0xFF7C3AED)),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                const SizedBox(height: 12),
                Text(
                  'Failed to load approvals',
                  style: GoogleFonts.dmSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.text,
                  ),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () => ref.invalidate(_pendingApprovalsProvider),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (approvals) {
          if (approvals.isEmpty) {
            return DiklyEmptyState(
              icon: Icons.check_circle_outline,
              iconColor: DiklyColors.success,
              iconBg: DiklyColors.successLight,
              title: 'All caught up!',
              subtitle: 'No pending approvals at the moment.',
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_pendingApprovalsProvider),
            color: _accent,
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              itemCount: approvals.length,
              itemBuilder: (_, i) {
                final item = approvals[i];
                final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
                final name = item['name']?.toString() ?? 'Unknown';
                final email = item['email']?.toString() ?? '';
                final role = item['role']?.toString() ?? 'student';
                final createdAt = item['createdAt']?.toString();
                final isProcessing = _processing.contains(id);
                final roleColor = _roleColor(role);
                final initials = name.isNotEmpty ? name[0].toUpperCase() : 'U';

                return DiklyCard(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header row
                      Row(children: [
                        CircleAvatar(
                          radius: 22,
                          backgroundColor: roleColor.withOpacity(0.12),
                          child: Text(
                            initials,
                            style: GoogleFonts.dmSans(
                              color: roleColor,
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
                                style: GoogleFonts.dmSans(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                  color: DiklyColors.text,
                                ),
                              ),
                              Text(
                                email,
                                style: GoogleFonts.dmSans(
                                  fontSize: 12,
                                  color: DiklyColors.textLight,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        if (createdAt != null)
                          Text(
                            _timeAgo(createdAt),
                            style: GoogleFonts.dmSans(
                              fontSize: 11,
                              color: DiklyColors.textLight,
                            ),
                          ),
                      ]),
                      const SizedBox(height: 10),
                      DiklyBadge(label: role.toUpperCase(), color: roleColor),
                      const SizedBox(height: 14),
                      if (isProcessing)
                        const Center(
                          child: SizedBox(
                            height: 24,
                            width: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFF7C3AED),
                            ),
                          ),
                        )
                      else
                        Row(children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _reject(item),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: DiklyColors.error,
                                side: const BorderSide(color: DiklyColors.error),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 10,
                                ),
                                textStyle: GoogleFonts.dmSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              icon: const Icon(Icons.close, size: 16),
                              label: const Text('Reject'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => _approve(item),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: DiklyColors.success,
                                foregroundColor: Colors.white,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 10,
                                ),
                                textStyle: GoogleFonts.dmSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              icon: const Icon(Icons.check, size: 16),
                              label: const Text('Approve'),
                            ),
                          ),
                        ]),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
