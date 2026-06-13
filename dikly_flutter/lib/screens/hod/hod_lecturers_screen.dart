import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _departmentLecturersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
      (ref) => apiService.getDepartmentLecturers(),
    );

class HodLecturersScreen extends ConsumerWidget {
  const HodLecturersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_departmentLecturersProvider);
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
            const Text('Failed to load lecturers', style: TextStyle(color: DiklyColors.textSecondary)),
            TextButton(
              onPressed: () => ref.invalidate(_departmentLecturersProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (lecturers) {
        final count = lecturers.length;
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_departmentLecturersProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            children: [
              DiklyScreenHeader(
                title: 'Lecturers',
                subtitle: '$count lecturer${count == 1 ? '' : 's'} in $dept',
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
              if (lecturers.isEmpty)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Text(
                      'No lecturers found.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  ),
                )
              else
                ...lecturers.map((l) => _LecturerCard(lecturer: l)),
            ],
          ),
        );
      },
    );
  }
}

class _LecturerCard extends StatelessWidget {
  final Map<String, dynamic> lecturer;
  const _LecturerCard({required this.lecturer});

  static const _color = Color(0xFF7C2D12);

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty && parts[0].isNotEmpty) return parts[0].substring(0, 1).toUpperCase();
    return 'L';
  }

  void _showDetails(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 20),
            CircleAvatar(
              radius: 36,
              backgroundColor: _color.withOpacity(0.12),
              child: Text(
                _initials(lecturer['name']?.toString() ?? 'L'),
                style: const TextStyle(color: _color, fontWeight: FontWeight.w800, fontSize: 24),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              lecturer['name']?.toString() ?? '',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: _color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
              child: const Text('LECTURER', style: TextStyle(fontSize: 11, color: _color, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 20),
            _DetailRow(icon: Icons.email_outlined, label: 'Email', value: lecturer['email']?.toString() ?? '—'),
            _DetailRow(icon: Icons.phone_outlined, label: 'Phone', value: lecturer['phone']?.toString() ?? '—'),
            _DetailRow(icon: Icons.school_outlined, label: 'Department', value: lecturer['department']?.toString() ?? '—'),
            _DetailRow(icon: Icons.book_outlined, label: 'Courses', value: '${lecturer['coursesCount'] ?? 0} course(s)'),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = lecturer['name']?.toString() ?? 'Unknown';
    final email = lecturer['email']?.toString() ?? '';
    final courses = lecturer['coursesCount'] ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: _color.withOpacity(0.12),
          child: Text(_initials(name), style: const TextStyle(color: _color, fontWeight: FontWeight.w700, fontSize: 13)),
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(email, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: DiklyColors.primary.withOpacity(0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            '$courses course${courses == 1 ? '' : 's'}',
            style: const TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600),
          ),
        ),
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
