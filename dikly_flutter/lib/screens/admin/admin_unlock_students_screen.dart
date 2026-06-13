import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _lockedStudentsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getLockedStudents(),
);

class AdminUnlockStudentsScreen extends ConsumerStatefulWidget {
  const AdminUnlockStudentsScreen({super.key});

  @override
  ConsumerState<AdminUnlockStudentsScreen> createState() => _AdminUnlockStudentsScreenState();
}

class _AdminUnlockStudentsScreenState extends ConsumerState<AdminUnlockStudentsScreen> {
  final Set<String> _processing = {};

  Future<void> _unlock(Map<String, dynamic> student) async {
    final id = student['_id']?.toString() ?? student['id']?.toString() ?? '';
    if (id.isEmpty || _processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.unlockStudent(id);
      ref.invalidate(_lockedStudentsProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${student['name'] ?? 'Student'} unlocked'),
          backgroundColor: DiklyColors.success,
        ),
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
    final asyncData = ref.watch(_lockedStudentsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Unlock Students', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_lockedStudentsProvider)),
        data: (students) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_lockedStudentsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Locked Student Accounts',
                subtitle: '${students.length} locked accounts · Failed logins & new device locks',
              ),
              if (students.isEmpty)
                DiklyCard(
                  padding: const EdgeInsets.all(32),
                  child: const Center(
                    child: Text(
                      'No locked student accounts. All clear! ✓',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                ...students.map((s) {
                  final id = s['_id']?.toString() ?? s['id']?.toString() ?? '';
                  final name = s['name']?.toString() ?? 'Unknown';
                  final indexNum = s['IndexNumber']?.toString() ?? s['indexNumber']?.toString() ?? '—';
                  final dept = s['department']?.toString() ?? '';
                  final reason = s['lockReason']?.toString() ?? s['lockedReason']?.toString() ?? '';
                  final isProcessing = _processing.contains(id);
                  final initials = name.length >= 2
                    ? '${name[0]}${name.split(' ').length > 1 ? name.split(' ')[1][0] : name[1]}'.toUpperCase()
                    : name[0].toUpperCase();

                  return DiklyCard(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 22,
                              backgroundColor: DiklyColors.error.withOpacity(0.1),
                              child: Text(initials, style: const TextStyle(color: DiklyColors.error, fontWeight: FontWeight.w700, fontSize: 14)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF111827))),
                                  Text(indexNum, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                                  if (dept.isNotEmpty) Text(dept, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: DiklyColors.error.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.lock, size: 10, color: DiklyColors.error),
                                  SizedBox(width: 3),
                                  Text('Locked', style: TextStyle(fontSize: 10, color: DiklyColors.error, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (reason.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: DiklyColors.error.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: DiklyColors.error.withOpacity(0.15)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.info_outline, size: 13, color: DiklyColors.error),
                                const SizedBox(width: 6),
                                Expanded(child: Text(reason, style: const TextStyle(fontSize: 12, color: DiklyColors.error))),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        if (isProcessing)
                          const Center(child: CircularProgressIndicator())
                        else
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: () => _unlock(s),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: DiklyColors.success,
                                foregroundColor: Colors.white,
                                elevation: 0,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                              ),
                              icon: const Icon(Icons.lock_open, size: 16),
                              label: const Text('Unlock Student'),
                            ),
                          ),
                      ],
                    ),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }
}
