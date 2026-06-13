import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _allStudentsForUnlockProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getDepartmentStudents(),
    );

class HodUnlockStudentsScreen extends ConsumerStatefulWidget {
  const HodUnlockStudentsScreen({super.key});

  @override
  ConsumerState<HodUnlockStudentsScreen> createState() =>
      _HodUnlockStudentsScreenState();
}

class _HodUnlockStudentsScreenState
    extends ConsumerState<HodUnlockStudentsScreen> {
  static const _color = Color(0xFF7C2D12);
  final Set<String> _processing = {};

  Future<void> _unlock(Map<String, dynamic> student) async {
    final id = student['_id']?.toString() ?? student['id']?.toString() ?? '';
    if (id.isEmpty || _processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.unlockStudent(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${student['name'] ?? 'Student'} unlocked successfully'),
            backgroundColor: DiklyColors.success,
          ),
        );
        ref.invalidate(_allStudentsForUnlockProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to unlock: $e'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty && parts[0].isNotEmpty) {
      return parts[0].substring(0, 1).toUpperCase();
    }
    return 'S';
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_allStudentsForUnlockProvider);
    ref.watch(authProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('Locked Student Accounts'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: DiklyColors.error,
              ),
              const SizedBox(height: 12),
              Text(
                'Failed to load students',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              TextButton(
                onPressed: () => ref.invalidate(_allStudentsForUnlockProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (allStudents) {
          final locked = allStudents.where((s) => s['isLocked'] == true).toList();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_allStudentsForUnlockProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: [
                DiklyScreenHeader(
                  title: 'Locked Student Accounts',
                  subtitle: '${locked.length} locked account${locked.length == 1 ? '' : 's'} · Failed logins & new device locks',
                ),
                if (locked.isEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: const Center(
                      child: Text(
                        'No locked student accounts. All clear! ✓',
                        style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                else
                  ...locked.map((student) {
                final id = student['_id']?.toString() ??
                    student['id']?.toString() ??
                    '';
                final name = student['name']?.toString() ?? 'Unknown';
                final indexNumber =
                    student['indexNumber']?.toString() ?? '—';
                final programme = student['programme']?.toString() ?? '—';
                final reason = student['lockedReason']?.toString();
                final isProcessing = _processing.contains(id);

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Stack(
                              children: [
                                CircleAvatar(
                                  radius: 24,
                                  backgroundColor: _color.withOpacity(0.12),
                                  child: Text(
                                    _initials(name),
                                    style: const TextStyle(
                                      color: _color,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 16,
                                    ),
                                  ),
                                ),
                                Positioned(
                                  bottom: 0,
                                  right: 0,
                                  child: Container(
                                    width: 16,
                                    height: 16,
                                    decoration: BoxDecoration(
                                      color: DiklyColors.error,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: Colors.white,
                                        width: 1.5,
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.lock,
                                      color: Colors.white,
                                      size: 9,
                                    ),
                                  ),
                                ),
                              ],
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
                                    indexNumber,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: DiklyColors.textSecondary,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  Text(
                                    programme,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: DiklyColors.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: DiklyColors.error.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.lock,
                                    size: 10,
                                    color: DiklyColors.error,
                                  ),
                                  SizedBox(width: 3),
                                  Text(
                                    'Locked',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: DiklyColors.error,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (reason != null && reason.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: DiklyColors.error.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: DiklyColors.error.withOpacity(0.2),
                              ),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(
                                  Icons.info_outline,
                                  size: 14,
                                  color: DiklyColors.error,
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    reason,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: DiklyColors.error,
                                      height: 1.4,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 14),
                        if (isProcessing)
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 4),
                              child: CircularProgressIndicator(),
                            ),
                          )
                        else
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: () => _unlock(student),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: DiklyColors.success,
                                foregroundColor: Colors.white,
                              ),
                              icon: const Icon(Icons.lock_open, size: 18),
                              label: const Text('Unlock Student'),
                            ),
                          ),
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
