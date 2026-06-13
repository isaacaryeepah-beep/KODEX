import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _departmentStudentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getDepartmentStudents(),
    );

class HodStudentsScreen extends ConsumerWidget {
  const HodStudentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_departmentStudentsProvider);
    final user = ref.watch(authProvider).user;
    final dept = user?.department ?? user?.company ?? '';

    return asyncData.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            const Text('Failed to load students', style: TextStyle(color: DiklyColors.textSecondary)),
            TextButton(
              onPressed: () => ref.invalidate(_departmentStudentsProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (students) {
        final count = students.length;
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_departmentStudentsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            children: [
              DiklyScreenHeader(
                title: 'Students',
                subtitle: '$count student${count == 1 ? '' : 's'} enrolled · $dept',
                action: OutlinedButton(
                  onPressed: () {},
                  style: OutlinedButton.styleFrom(
                    foregroundColor: DiklyColors.textSecondary,
                    side: const BorderSide(color: DiklyColors.border),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                  ),
                  child: const Text('Export CSV'),
                ),
              ),
              if (students.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 60),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: const Center(
                    child: Text(
                      'No students found.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ),
                )
              else
                ...students.map((s) => _StudentCard(student: s, onUnlocked: () => ref.invalidate(_departmentStudentsProvider))),
            ],
          ),
        );
      },
    );
  }
}

class _StudentCard extends StatelessWidget {
  final Map<String, dynamic> student;
  final VoidCallback onUnlocked;
  const _StudentCard({required this.student, required this.onUnlocked});

  static const _color = Color(0xFF7C2D12);

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty && parts[0].isNotEmpty) return parts[0].substring(0, 1).toUpperCase();
    return 'S';
  }

  Future<void> _unlock(BuildContext context) async {
    final id = student['_id']?.toString() ?? student['id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      await apiService.unlockStudent(id);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${student['name'] ?? 'Student'} unlocked'),
            backgroundColor: DiklyColors.success,
          ),
        );
        onUnlocked();
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  void _showDetails(BuildContext context) {
    final isLocked = student['isLocked'] == true;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 20),
            Stack(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: _color.withOpacity(0.12),
                  child: Text(
                    _initials(student['name']?.toString() ?? 'S'),
                    style: const TextStyle(color: _color, fontWeight: FontWeight.w800, fontSize: 24),
                  ),
                ),
                if (isLocked)
                  Positioned(
                    bottom: 0, right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        color: DiklyColors.error,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                      child: const Icon(Icons.lock, color: Colors.white, size: 14),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              student['name']?.toString() ?? '',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: DiklyColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text('STUDENT', style: TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w700)),
                ),
                if (isLocked) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: DiklyColors.error.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('LOCKED', style: TextStyle(fontSize: 11, color: DiklyColors.error, fontWeight: FontWeight.w700)),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 20),
            _DetailRow(icon: Icons.email_outlined, label: 'Email', value: student['email']?.toString() ?? '—'),
            _DetailRow(icon: Icons.badge_outlined, label: 'Index Number', value: student['indexNumber']?.toString() ?? '—'),
            _DetailRow(icon: Icons.school_outlined, label: 'Programme', value: student['programme']?.toString() ?? '—'),
            if (student['lockedReason'] != null)
              _DetailRow(icon: Icons.info_outline, label: 'Lock Reason', value: student['lockedReason'].toString()),
            const SizedBox(height: 16),
            if (isLocked)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(sheetCtx);
                    _unlock(context);
                  },
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
  }

  @override
  Widget build(BuildContext context) {
    final name = student['name']?.toString() ?? 'Unknown';
    final indexNum = student['indexNumber']?.toString() ?? '—';
    final programme = student['programme']?.toString() ?? '—';
    final isLocked = student['isLocked'] == true;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Stack(
          children: [
            CircleAvatar(
              backgroundColor: _color.withOpacity(0.12),
              child: Text(_initials(name), style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 13)),
            ),
            if (isLocked)
              Positioned(
                bottom: 0, right: 0,
                child: Container(
                  width: 14, height: 14,
                  decoration: BoxDecoration(
                    color: DiklyColors.error,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 1.5),
                  ),
                  child: const Icon(Icons.lock, color: Colors.white, size: 8),
                ),
              ),
          ],
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(indexNum, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            Text(programme, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
          ],
        ),
        isThreeLine: true,
        onTap: () => _showDetails(context),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _DetailRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Icon(icon, size: 18, color: DiklyColors.textSecondary),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
              Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ]),
    );
  }
}
