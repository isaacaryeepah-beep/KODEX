import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/ds/dikly_ds.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  List<User> _users = [];
  bool _loading = true;
  String? _error;
  final _searchController = TextEditingController();

  static const _deptColors = [
    Color(0xFF2563EB),
    Color(0xFFDC2626),
    Color(0xFF7C3AED),
    Color(0xFF16A34A),
    Color(0xFFD97706),
    Color(0xFF0891B2),
    Color(0xFFDB2777),
    Color(0xFF65A30D),
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
    _searchController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await apiService.getUsers();
      setState(() {
        _users = users;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Map<String, List<User>> _groupByDept() {
    final query = _searchController.text.toLowerCase();
    final map = <String, List<User>>{};
    for (final u in _users) {
      final dept = (u.department?.isNotEmpty == true) ? u.department! : 'General';
      if (query.isNotEmpty) {
        final matchesDept = dept.toLowerCase().contains(query);
        final matchesUser = u.name.toLowerCase().contains(query) ||
            u.email.toLowerCase().contains(query) ||
            (u.indexNumber?.toLowerCase().contains(query) ?? false);
        if (!matchesDept && !matchesUser) continue;
      }
      map[dept] = [...(map[dept] ?? []), u];
    }
    return map;
  }

  Future<void> _showAddUserSheet() async {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    String selectedRole = 'student';
    bool saving = false;
    String? sheetError;

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 24 + bottomInset),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
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
                Text(
                  'Add User',
                  style: GoogleFonts.dmSans(fontSize: 20, fontWeight: FontWeight.w700, color: DiklyColors.text),
                ),
                const SizedBox(height: 4),
                Text(
                  'Fill in the details to create a new user account.',
                  style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textLight),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: nameCtrl,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Full Name',
                    prefixIcon: Icon(Icons.person_outline, size: 20),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email Address',
                    prefixIcon: Icon(Icons.email_outlined, size: 20),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedRole,
                  decoration: const InputDecoration(
                    labelText: 'Role',
                    prefixIcon: Icon(Icons.badge_outlined, size: 20),
                  ),
                  items: ['student', 'lecturer', 'manager', 'admin', 'hod', 'employee']
                      .map((r) => DropdownMenuItem(
                            value: r,
                            child: Text(r[0].toUpperCase() + r.substring(1), style: GoogleFonts.dmSans(fontSize: 14)),
                          ))
                      .toList(),
                  onChanged: (v) => setSheet(() => selectedRole = v ?? 'student'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: passCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    prefixIcon: Icon(Icons.lock_outline, size: 20),
                  ),
                ),
                if (sheetError != null) ...[
                  const SizedBox(height: 10),
                  Text(sheetError!, style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.error)),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: saving
                        ? null
                        : () async {
                            setSheet(() {
                              saving = true;
                              sheetError = null;
                            });
                            try {
                              await apiService.createUser({
                                'name': nameCtrl.text.trim(),
                                'email': emailCtrl.text.trim(),
                                'password': passCtrl.text,
                                'role': selectedRole,
                              });
                              if (ctx.mounted) Navigator.pop(ctx, true);
                            } catch (e) {
                              setSheet(() {
                                sheetError = 'Failed to create user. Please try again.';
                                saving = false;
                              });
                            }
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: DiklyColors.primary,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      textStyle: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    child: saving
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Create User'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );

    if (result == true) {
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('User created successfully'), backgroundColor: DiklyColors.success),
        );
      }
    }
  }

  void _openDept(String deptName, List<User> members, Color color) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        minChildSize: 0.4,
        builder: (ctx, scrollCtrl) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: color.withOpacity(0.12),
                    child: Text(
                      deptName.isNotEmpty ? deptName[0].toUpperCase() : '?',
                      style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(deptName, style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                        Text('${members.length} member${members.length == 1 ? '' : 's'}',
                            style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight)),
                      ],
                    ),
                  ),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(ctx)),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: members.length,
                itemBuilder: (_, i) => _UserCard(user: members[i]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final studentCount = _users.where((u) => u.role == 'student').length;
    final deptMap = _groupByDept();
    final deptCount = _users.map((u) => u.department).where((d) => d != null && d.isNotEmpty).toSet().length;

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: Column(
        children: [
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklyScreenHeader(
                  title: 'Users',
                  subtitle: '$studentCount student${studentCount == 1 ? '' : 's'} · $deptCount department${deptCount == 1 ? '' : 's'}',
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      ElevatedButton.icon(
                        onPressed: _showAddUserSheet,
                        icon: const Icon(Icons.person_add_alt_1_outlined, size: 15),
                        label: const Text('Add User'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: DiklyColors.primary,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bulk Import — coming soon'))),
                        icon: const Icon(Icons.upload_outlined, size: 15),
                        label: const Text('Bulk Import'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                          side: const BorderSide(color: Color(0xFFD1D5DB)),
                          foregroundColor: const Color(0xFF374151),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reset Log — coming soon'))),
                        icon: const Icon(Icons.refresh, size: 15),
                        label: const Text('Reset Log'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                          side: const BorderSide(color: Color(0xFFD1D5DB)),
                          foregroundColor: const Color(0xFF374151),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search departments, names, index numbers...',
                    hintStyle: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                    prefixIcon: const Icon(Icons.search_outlined, size: 20, color: DiklyColors.textMuted),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () => _searchController.clear())
                        : null,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    filled: true,
                    fillColor: DiklyColors.background,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.primary, width: 2)),
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
          const Divider(height: 1, color: DiklyColors.border),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                            const SizedBox(height: 12),
                            Text('Failed to load users', style: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w600, color: DiklyColors.text)),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: _loadData,
                              style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.primary, foregroundColor: Colors.white, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                              icon: const Icon(Icons.refresh, size: 16),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      )
                    : deptMap.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.people_outlined,
                            title: 'No users found',
                            subtitle: _searchController.text.isNotEmpty
                                ? 'No results for "${_searchController.text}".'
                                : 'Users will appear here once added.',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            color: DiklyColors.primary,
                            child: GridView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 2,
                                crossAxisSpacing: 12,
                                mainAxisSpacing: 12,
                                childAspectRatio: 0.82,
                              ),
                              itemCount: deptMap.length,
                              itemBuilder: (ctx, i) {
                                final entry = deptMap.entries.elementAt(i);
                                final color = _deptColors[i % _deptColors.length];
                                return _DeptCard(
                                  deptName: entry.key,
                                  members: entry.value,
                                  color: color,
                                  onOpen: () => _openDept(entry.key, entry.value, color),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _DeptCard extends StatelessWidget {
  final String deptName;
  final List<User> members;
  final Color color;
  final VoidCallback onOpen;

  const _DeptCard({
    required this.deptName,
    required this.members,
    required this.color,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    final students = members.where((u) => u.role == 'student').length;
    final lecturers = members.where((u) => u.role == 'lecturer').length;
    final hod = members.firstWhere((u) => u.role == 'hod', orElse: () => members.first);
    final hodName = hod.role == 'hod' ? hod.name.toUpperCase() : '—';
    final levels = members
        .where((u) => u.role == 'student' && u.level != null && u.level!.isNotEmpty)
        .map((u) => u.level!)
        .toSet()
        .toList()
      ..sort();

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(top: BorderSide(color: color, width: 3)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: color.withOpacity(0.12),
                  child: Text(
                    deptName.isNotEmpty ? deptName[0].toUpperCase() : '?',
                    style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                ),
                const Spacer(),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              deptName.toUpperCase(),
              style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w800, color: const Color(0xFF111827)),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              'HOD: $hodName',
              style: GoogleFonts.dmSans(fontSize: 9, color: const Color(0xFF6B7280)),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _StatCol(label: 'STUDENTS', value: students),
                _StatCol(label: 'LECTURERS', value: lecturers),
                _StatCol(label: 'LEVELS', value: levels.isEmpty ? 0 : levels.length),
              ],
            ),
            if (levels.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 4,
                children: levels.map((l) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(l, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color)),
                )).toList(),
              ),
            ],
            const Spacer(),
            GestureDetector(
              onTap: onOpen,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text('Open', style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w600, color: const Color(0xFF16A34A))),
                  const SizedBox(width: 2),
                  const Icon(Icons.arrow_forward, size: 12, color: Color(0xFF16A34A)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final int value;
  const _StatCol({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            '$value',
            style: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w800, color: const Color(0xFF111827)),
          ),
          Text(
            label,
            style: GoogleFonts.dmSans(fontSize: 7, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 0.3),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _UserCard extends StatelessWidget {
  final User user;
  const _UserCard({required this.user});

  Color get _roleColor {
    switch (user.role) {
      case 'student': return DiklyColors.primary;
      case 'lecturer': return const Color(0xFF7C3AED);
      case 'admin': return const Color(0xFF0F172A);
      case 'manager': return const Color(0xFF0D9488);
      case 'hod': return DiklyColors.error;
      case 'employee': return DiklyColors.warning;
      default: return DiklyColors.textLight;
    }
  }

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0].isNotEmpty ? parts[0][0].toUpperCase() : 'U';
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: _roleColor.withOpacity(0.12),
            child: Text(_initials, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: _roleColor)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                const SizedBox(height: 1),
                Text(user.email, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight), overflow: TextOverflow.ellipsis),
                if (user.indexNumber != null && user.indexNumber!.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(user.indexNumber!, style: GoogleFonts.dmSans(fontSize: 10, color: DiklyColors.textMuted)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          DiklyBadge(label: user.role.toUpperCase(), color: _roleColor),
        ],
      ),
    );
  }
}
