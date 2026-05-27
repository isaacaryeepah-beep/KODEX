import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({super.key});

  @override
  State<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends State<AdminUsersScreen> {
  List<User> _users = [];
  bool _loading = true;
  String _search = '';
  String _filter = 'all';

  static const _roles = ['all', 'student', 'lecturer', 'manager', 'admin', 'hod', 'employee'];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final users = await apiService.getUsers();
      setState(() { _users = users; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
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
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
              onPressed: () async {
                Navigator.pop(context);
                try {
                  await apiService.createUser({'name': nameCtrl.text.trim(), 'email': emailCtrl.text.trim(), 'password': passCtrl.text, 'role': selectedRole});
                  _load();
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
    final filtered = _users.where((u) {
      final matchRole = _filter == 'all' || u.role == _filter;
      final matchSearch = _search.isEmpty || u.name.toLowerCase().contains(_search.toLowerCase()) || u.email.toLowerCase().contains(_search.toLowerCase());
      return matchRole && matchSearch;
    }).toList();

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateDialog,
        backgroundColor: const Color(0xFFDC2626),
        icon: const Icon(Icons.person_add_outlined),
        label: const Text('Add User'),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 20), hintText: 'Search users...'),
              onChanged: (v) => setState(() => _search = v),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 36,
              child: ListView(scrollDirection: Axis.horizontal, children: _roles.map((r) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(r, style: const TextStyle(fontSize: 12)),
                  selected: _filter == r,
                  onSelected: (_) => setState(() => _filter = r),
                  selectedColor: const Color(0xFFDC2626).withOpacity(0.15),
                  checkmarkColor: const Color(0xFFDC2626),
                ),
              )).toList()),
            ),
          ]),
        ),
        Expanded(child: _loading
            ? const Center(child: CircularProgressIndicator())
            : filtered.isEmpty
                ? const DiklyEmptyState(icon: Icons.people_outlined, title: 'No Users', subtitle: 'No users match your filters.')
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final u = filtered[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFFDC2626).withOpacity(0.1),
                            child: Text(u.name.substring(0, 1).toUpperCase(), style: const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w700)),
                          ),
                          title: Text(u.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                          subtitle: Text(u.email, style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(6)),
                            child: Text(u.role, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
                          ),
                        ),
                      );
                    },
                  )),
      ]),
    );
  }
}
