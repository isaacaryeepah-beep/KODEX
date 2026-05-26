import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _departmentStudentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getDepartmentStudents(),
);

class HodStudentsScreen extends ConsumerStatefulWidget {
  const HodStudentsScreen({super.key});

  @override
  ConsumerState<HodStudentsScreen> createState() => _HodStudentsScreenState();
}

class _HodStudentsScreenState extends ConsumerState<HodStudentsScreen> {
  static const _accent = Color(0xFF7C3AED);
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty && parts[0].isNotEmpty) {
      return parts[0].substring(0, 1).toUpperCase();
    }
    return 'S';
  }

  Future<void> _unlock(BuildContext ctx, Map<String, dynamic> student) async {
    final id = student['_id']?.toString() ?? student['id']?.toString() ?? '';
    if (id.isEmpty) return;
    try {
      await apiService.unlockStudent(id);
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(
            content: Text('${student['name'] ?? 'Student'} unlocked'),
            backgroundColor: DiklyColors.success,
          ),
        );
        ref.invalidate(_departmentStudentsProvider);
      }
    } catch (e) {
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(
            content: Text('Failed: $e'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    }
  }

  void _showDetails(BuildContext context, Map<String, dynamic> student) {
    final isLocked = student['isLocked'] == true;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: DiklyColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Stack(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: DiklyColors.primary.withOpacity(0.12),
                  child: Text(
                    _initials(student['name']?.toString() ?? 'S'),
                    style: GoogleFonts.dmSans(
                      color: DiklyColors.primary,
                      fontWeight: FontWeight.w800,
                      fontSize: 24,
                    ),
                  ),
                ),
                if (isLocked)
                  Positioned(
                    bottom: 0,
                    right: 0,
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
              style: GoogleFonts.dmSans(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: DiklyColors.text,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                DiklyBadge(label: 'STUDENT', color: DiklyColors.primary),
                if (isLocked) ...[
                  const SizedBox(width: 6),
                  DiklyBadge(label: 'LOCKED', color: DiklyColors.error),
                ],
              ],
            ),
            const SizedBox(height: 20),
            _DetailRow(
              icon: Icons.email_outlined,
              label: 'Email',
              value: student['email']?.toString() ?? '—',
            ),
            _DetailRow(
              icon: Icons.badge_outlined,
              label: 'Index Number',
              value: student['indexNumber']?.toString() ?? '—',
            ),
            _DetailRow(
              icon: Icons.school_outlined,
              label: 'Programme',
              value: student['programme']?.toString() ?? '—',
            ),
            if (student['lockedReason'] != null)
              _DetailRow(
                icon: Icons.info_outline,
                label: 'Lock Reason',
                value: student['lockedReason'].toString(),
              ),
            const SizedBox(height: 16),
            if (isLocked)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(sheetCtx);
                    _unlock(context, student);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: DiklyColors.success,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    textStyle: GoogleFonts.dmSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
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
    final asyncData = ref.watch(_departmentStudentsProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(color: DiklyColors.text),
        title: Text(
          'Students',
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
                  'Failed to load students',
                  style: GoogleFonts.dmSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.text,
                  ),
                ),
                TextButton.icon(
                  onPressed: () => ref.invalidate(_departmentStudentsProvider),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (students) {
          final filtered = _query.isEmpty
              ? students
              : students.where((s) {
                  final name = s['name']?.toString().toLowerCase() ?? '';
                  final idx = s['indexNumber']?.toString().toLowerCase() ?? '';
                  final prog = s['programme']?.toString().toLowerCase() ?? '';
                  return name.contains(_query) ||
                      idx.contains(_query) ||
                      prog.contains(_query);
                }).toList();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_departmentStudentsProvider),
            color: _accent,
            child: Column(
              children: [
                // Search bar
                Container(
                  color: DiklyColors.surface,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: TextField(
                    controller: _searchCtrl,
                    decoration: InputDecoration(
                      hintText: 'Search by name, index or programme…',
                      hintStyle: GoogleFonts.dmSans(
                        fontSize: 14,
                        color: DiklyColors.textMuted,
                      ),
                      prefixIcon: const Icon(Icons.search_outlined, size: 20, color: DiklyColors.textMuted),
                      suffixIcon: _query.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _searchCtrl.clear();
                                setState(() => _query = '');
                              },
                            )
                          : null,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      filled: true,
                      fillColor: DiklyColors.background,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: DiklyColors.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: DiklyColors.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(color: _accent, width: 2),
                      ),
                    ),
                    onChanged: (v) => setState(() => _query = v.toLowerCase()),
                  ),
                ),
                const Divider(height: 1, color: DiklyColors.border),

                // List or empty
                if (filtered.isEmpty)
                  Expanded(
                    child: DiklyEmptyState(
                      icon: Icons.school_outlined,
                      iconColor: DiklyColors.textLight,
                      iconBg: DiklyColors.background,
                      title: _query.isEmpty ? 'No students found' : 'No results for "$_query"',
                      subtitle: 'Students in your department will appear here.',
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final s = filtered[i];
                        final name = s['name']?.toString() ?? 'Unknown';
                        final indexNum = s['indexNumber']?.toString() ?? '—';
                        final programme = s['programme']?.toString() ?? '—';
                        final isLocked = s['isLocked'] == true;

                        return DiklyCard(
                          margin: const EdgeInsets.only(bottom: 10),
                          onTap: () => _showDetails(context, s),
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              Stack(
                                children: [
                                  CircleAvatar(
                                    radius: 22,
                                    backgroundColor: DiklyColors.primary.withOpacity(0.12),
                                    child: Text(
                                      _initials(name),
                                      style: GoogleFonts.dmSans(
                                        color: DiklyColors.primary,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                  if (isLocked)
                                    Positioned(
                                      bottom: 0,
                                      right: 0,
                                      child: Container(
                                        width: 14,
                                        height: 14,
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
                                          size: 8,
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
                                      style: GoogleFonts.dmSans(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        color: DiklyColors.text,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      indexNum,
                                      style: GoogleFonts.dmSans(
                                        fontSize: 12,
                                        color: DiklyColors.textLight,
                                      ),
                                    ),
                                    Text(
                                      programme,
                                      style: GoogleFonts.dmSans(
                                        fontSize: 11,
                                        color: DiklyColors.textMuted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              DiklyBadge(
                                label: isLocked ? 'Locked' : 'Active',
                                color: isLocked ? DiklyColors.error : DiklyColors.success,
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Icon(icon, size: 18, color: DiklyColors.textLight),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: GoogleFonts.dmSans(
                  fontSize: 11,
                  color: DiklyColors.textLight,
                ),
              ),
              Text(
                value,
                style: GoogleFonts.dmSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: DiklyColors.text,
                ),
              ),
            ],
          ),
        ),
      ]),
    );
  }
}
