import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/ds/dikly_ds.dart';

final _adminUsersProvider = FutureProvider.autoDispose<List<User>>(
  (ref) => apiService.getUsers(),
);

class AdminUsersScreen extends ConsumerStatefulWidget {
  const AdminUsersScreen({super.key});

  @override
  ConsumerState<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends ConsumerState<AdminUsersScreen> {
  static const _accent = Color(0xFF4F6EF7);
  String _search = '';

  static const _deptColors = [
    Color(0xFF4F6EF7),
    Color(0xFF7C3AED),
    Color(0xFF0891B2),
    Color(0xFF059669),
    Color(0xFFD97706),
    Color(0xFFDC2626),
  ];

  Color _colorForDept(String name, int index) {
    return _deptColors[index % _deptColors.length];
  }

  void _showDeptUsers(BuildContext context, String deptName, List<User> users, Color color, {String initialTab = 'students'}) {
    final students  = users.where((u) => u.isStudent).toList();
    final lecturers = users.where((u) => u.isLecturer || u.role == 'hod').toList();
    final startIdx  = initialTab == 'lecturers' ? 1 : 0;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => DefaultTabController(
        length: 2,
        initialIndex: startIdx,
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.75,
          maxChildSize: 0.95,
          minChildSize: 0.4,
          builder: (ctx, scrollCtrl) => Column(
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: color.withOpacity(0.12),
                      child: Text(
                        deptName.isNotEmpty ? deptName[0].toUpperCase() : '?',
                        style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 15),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(deptName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                          Text('${students.length} students · ${lecturers.length} lecturers',
                              style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                        ],
                      ),
                    ),
                    IconButton(icon: const Icon(Icons.close, size: 20), onPressed: () => Navigator.pop(ctx)),
                  ],
                ),
              ),
              TabBar(
                labelColor: color,
                unselectedLabelColor: DiklyColors.textSecondary,
                indicatorColor: color,
                labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                tabs: [
                  Tab(text: 'Students (${students.length})'),
                  Tab(text: 'Lecturers (${lecturers.length})'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    _buildUserList(scrollCtrl, students, 'No students in this department'),
                    _buildUserList(scrollCtrl, lecturers, 'No lecturers in this department'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildUserList(ScrollController ctrl, List<User> users, String emptyMsg) {
    if (users.isEmpty) {
      return Center(child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(emptyMsg, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
      ));
    }
    return ListView.separated(
      controller: ctrl,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: users.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) {
        final u = users[i];
        final initials = u.name.trim().split(' ').where((p) => p.isNotEmpty).take(2).map((p) => p[0].toUpperCase()).join();
        return ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
          leading: CircleAvatar(
            radius: 18,
            backgroundImage: u.avatar?.isNotEmpty == true ? NetworkImage(u.avatar!) : null,
            backgroundColor: DiklyColors.primary.withOpacity(0.12),
            child: u.avatar?.isNotEmpty == true ? null : Text(initials, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: DiklyColors.primary)),
          ),
          title: Text(u.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          subtitle: Text(u.indexNumber ?? u.email, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
          trailing: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
            child: Text(u.role, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: DiklyColors.primary)),
          ),
        );
      },
    );
  }

  void _showCreateDialog() {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    String selectedRole = 'student';

    showDialog(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Create User', style: TextStyle(fontWeight: FontWeight.w700)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Full Name')),
            const SizedBox(height: 10),
            TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 10),
            TextField(controller: passCtrl, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: selectedRole,
              items: ['student', 'lecturer', 'manager', 'admin', 'hod', 'employee']
                  .map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
              onChanged: (v) => setDialogState(() => selectedRole = v ?? 'student'),
              decoration: const InputDecoration(labelText: 'Role'),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: _accent),
              onPressed: () async {
                Navigator.pop(context);
                try {
                  await apiService.createUser({'name': nameCtrl.text.trim(), 'email': emailCtrl.text.trim(), 'password': passCtrl.text, 'role': selectedRole});
                  ref.invalidate(_adminUsersProvider);
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User created!')));
                } catch (e) {
                  if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_adminUsersProvider);

    return asyncData.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => DiklyErrorView(
        message: e.toString(),
        onRetry: () => ref.invalidate(_adminUsersProvider),
      ),
      data: (users) {
        // Group by department
        final deptMap = <String, List<User>>{};
        for (final u in users) {
          final dept = u.department?.isNotEmpty == true ? u.department! : 'Unassigned';
          deptMap.putIfAbsent(dept, () => []).add(u);
        }
        final depts = deptMap.keys.toList()..sort();

        // Filter by search
        final q = _search.toLowerCase();
        final filteredDepts = q.isEmpty
            ? depts
            : depts.where((d) {
                if (d.toLowerCase().contains(q)) return true;
                return deptMap[d]!.any((u) =>
                    u.name.toLowerCase().contains(q) ||
                    u.email.toLowerCase().contains(q));
              }).toList();

        final totalStudents = users.where((u) => u.isStudent).length;

        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_adminUsersProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Users',
                subtitle: '$totalStudents student${totalStudents == 1 ? '' : 's'} · ${depts.length} department${depts.length == 1 ? '' : 's'}',
              ),
              // Action buttons
              Row(
                children: [
                  ElevatedButton.icon(
                    onPressed: _showCreateDialog,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _accent,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                      textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    icon: const Icon(Icons.person_add_outlined, size: 16),
                    label: const Text('Add User'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Bulk import — coming soon')),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DiklyColors.textSecondary,
                      side: const BorderSide(color: DiklyColors.border),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      textStyle: const TextStyle(fontSize: 12),
                    ),
                    icon: const Icon(Icons.upload_outlined, size: 16),
                    label: const Text('Bulk Import'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Search
              TextField(
                onChanged: (v) => setState(() => _search = v),
                decoration: InputDecoration(
                  hintText: 'Search departments, names, index numbers...',
                  hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                  prefixIcon: const Icon(Icons.search, size: 18, color: Color(0xFF9CA3AF)),
                  contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: _accent),
                  ),
                  filled: true,
                  fillColor: Colors.white,
                ),
              ),
              const SizedBox(height: 14),
              if (filteredDepts.isEmpty)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Text('No departments found.', style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                  ),
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 0.85,
                  ),
                  itemCount: filteredDepts.length,
                  itemBuilder: (_, i) {
                    final deptName = filteredDepts[i];
                    final deptUsers = deptMap[deptName]!;
                    final color = _colorForDept(deptName, i);
                    return _DeptCard(
                      deptName: deptName,
                      users: deptUsers,
                      color: color,
                      onTapStudents:  () => _showDeptUsers(context, deptName, deptUsers, color, initialTab: 'students'),
                      onTapLecturers: () => _showDeptUsers(context, deptName, deptUsers, color, initialTab: 'lecturers'),
                    );
                  },
                ),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }
}

class _DeptCard extends StatelessWidget {
  final String deptName;
  final List<User> users;
  final Color color;
  final VoidCallback onTapStudents;
  final VoidCallback onTapLecturers;

  const _DeptCard({
    required this.deptName,
    required this.users,
    required this.color,
    required this.onTapStudents,
    required this.onTapLecturers,
  });

  @override
  Widget build(BuildContext context) {
    final students = users.where((u) => u.isStudent).toList();
    final lecturers = users.where((u) => u.isLecturer).toList();
    final hod = users.firstWhere(
      (u) => u.isHod,
      orElse: () => lecturers.isNotEmpty ? lecturers.first : students.isNotEmpty ? students.first : users.first,
    );
    final levels = students
        .map((u) => u.level)
        .where((l) => l != null && l!.isNotEmpty)
        .map((l) => l!)
        .toSet()
        .toList()
      ..sort();

    final initial = deptName.isNotEmpty ? deptName[0].toUpperCase() : '?';

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Colored top bar
          Container(
            height: 4,
            decoration: BoxDecoration(
              color: color,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Initial circle
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: color.withOpacity(0.15),
                    child: Text(initial, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 16)),
                  ),
                  const SizedBox(height: 8),
                  // Department name
                  Text(
                    deptName.toUpperCase(),
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF111827), letterSpacing: 0.3),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  // HOD name
                  Text(
                    'HOD: ${hod.name}',
                    style: const TextStyle(fontSize: 9, color: Color(0xFF6B7280)),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 10),
                  // Stats row — Students and Lecturers are tappable
                  Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: onTapStudents,
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF4F6EF7).withOpacity(0.08),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: const Color(0xFF4F6EF7).withOpacity(0.2)),
                            ),
                            child: Column(children: [
                              Text('${students.length}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF4F6EF7), height: 1.1)),
                              const Text('STUDENTS', style: TextStyle(fontSize: 7, fontWeight: FontWeight.w700, color: Color(0xFF4F6EF7), letterSpacing: 0.2)),
                            ]),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: GestureDetector(
                          onTap: onTapLecturers,
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFF7C3AED).withOpacity(0.08),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: const Color(0xFF7C3AED).withOpacity(0.2)),
                            ),
                            child: Column(children: [
                              Text('${lecturers.length}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF7C3AED), height: 1.1)),
                              const Text('LECTURERS', style: TextStyle(fontSize: 7, fontWeight: FontWeight.w700, color: Color(0xFF7C3AED), letterSpacing: 0.2)),
                            ]),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      _Stat(value: '${levels.length}', label: 'LEVELS', color: const Color(0xFF059669)),
                    ],
                  ),
                  if (levels.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 4,
                      children: levels.map((l) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(l, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF374151))),
                      )).toList(),
                    ),
                  ],
                  const Spacer(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${levels.length} level${levels.length == 1 ? '' : 's'}',
                        style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF)),
                      ),
                      Text(
                        'Tap stats →',
                        style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _Stat({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color, height: 1.1)),
        Text(label, style: const TextStyle(fontSize: 7, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.2)),
      ],
    );
  }
}
