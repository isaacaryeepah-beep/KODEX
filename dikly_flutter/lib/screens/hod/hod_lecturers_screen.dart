import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _departmentLecturersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getDepartmentLecturers(),
);

class HodLecturersScreen extends ConsumerStatefulWidget {
  const HodLecturersScreen({super.key});

  @override
  ConsumerState<HodLecturersScreen> createState() => _HodLecturersScreenState();
}

class _HodLecturersScreenState extends ConsumerState<HodLecturersScreen> {
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
    return 'L';
  }

  void _showDetails(BuildContext context, Map<String, dynamic> lecturer) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
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
            CircleAvatar(
              radius: 36,
              backgroundColor: _accent.withOpacity(0.12),
              child: Text(
                _initials(lecturer['name']?.toString() ?? 'L'),
                style: GoogleFonts.dmSans(
                  color: _accent,
                  fontWeight: FontWeight.w800,
                  fontSize: 24,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              lecturer['name']?.toString() ?? '',
              style: GoogleFonts.dmSans(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: DiklyColors.text,
              ),
            ),
            const SizedBox(height: 6),
            DiklyBadge(label: 'LECTURER', color: _accent),
            const SizedBox(height: 20),
            _DetailRow(
              icon: Icons.email_outlined,
              label: 'Email',
              value: lecturer['email']?.toString() ?? '—',
            ),
            _DetailRow(
              icon: Icons.phone_outlined,
              label: 'Phone',
              value: lecturer['phone']?.toString() ?? '—',
            ),
            _DetailRow(
              icon: Icons.school_outlined,
              label: 'Department',
              value: lecturer['department']?.toString() ?? '—',
            ),
            _DetailRow(
              icon: Icons.book_outlined,
              label: 'Courses',
              value: '${lecturer['coursesCount'] ?? 0} course(s)',
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_departmentLecturersProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(color: DiklyColors.text),
        title: Text(
          'Lecturers',
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
                  'Failed to load lecturers',
                  style: GoogleFonts.dmSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.text,
                  ),
                ),
                TextButton.icon(
                  onPressed: () => ref.invalidate(_departmentLecturersProvider),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (lecturers) {
          final filtered = _query.isEmpty
              ? lecturers
              : lecturers.where((l) {
                  final name = l['name']?.toString().toLowerCase() ?? '';
                  final email = l['email']?.toString().toLowerCase() ?? '';
                  final dept = l['department']?.toString().toLowerCase() ?? '';
                  return name.contains(_query) ||
                      email.contains(_query) ||
                      dept.contains(_query);
                }).toList();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_departmentLecturersProvider),
            color: _accent,
            child: Column(
              children: [
                // Search
                Container(
                  color: DiklyColors.surface,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: TextField(
                    controller: _searchCtrl,
                    decoration: InputDecoration(
                      hintText: 'Search by name, email or department…',
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
                      icon: Icons.cast_for_education_outlined,
                      iconColor: DiklyColors.textLight,
                      iconBg: DiklyColors.background,
                      title: _query.isEmpty ? 'No lecturers found' : 'No results for "$_query"',
                      subtitle: 'Lecturers in your department will appear here.',
                    ),
                  )
                else
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final l = filtered[i];
                        final name = l['name']?.toString() ?? 'Unknown';
                        final email = l['email']?.toString() ?? '';
                        final department = l['department']?.toString() ?? '';
                        final courses = l['coursesCount'] ?? 0;

                        return DiklyCard(
                          margin: const EdgeInsets.only(bottom: 10),
                          onTap: () => _showDetails(context, l),
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: _accent.withOpacity(0.12),
                                child: Text(
                                  _initials(name),
                                  style: GoogleFonts.dmSans(
                                    color: _accent,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
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
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        color: DiklyColors.text,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      email,
                                      style: GoogleFonts.dmSans(
                                        fontSize: 12,
                                        color: DiklyColors.textLight,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    if (department.isNotEmpty) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        department,
                                        style: GoogleFonts.dmSans(
                                          fontSize: 11,
                                          color: DiklyColors.textMuted,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: DiklyColors.primaryULight,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  '$courses course${courses == 1 ? '' : 's'}',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 11,
                                    color: DiklyColors.primary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
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
