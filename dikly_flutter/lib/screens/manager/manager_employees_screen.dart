import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/empty_state.dart';

class ManagerEmployeesScreen extends ConsumerStatefulWidget {
  const ManagerEmployeesScreen({super.key});

  @override
  ConsumerState<ManagerEmployeesScreen> createState() => _ManagerEmployeesScreenState();
}

class _ManagerEmployeesScreenState extends ConsumerState<ManagerEmployeesScreen> {
  List<User> _users = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final users = await apiService.getUsers();
      setState(() { _users = users; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _users.where((u) => _search.isEmpty || u.name.toLowerCase().contains(_search.toLowerCase()) || u.email.toLowerCase().contains(_search.toLowerCase())).toList();

    return Column(children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 20), hintText: 'Search employees...'),
          onChanged: (v) => setState(() => _search = v),
        ),
      ),
      Expanded(child: _loading
          ? const Center(child: CircularProgressIndicator())
          : filtered.isEmpty
              ? const EmptyState(icon: Icons.people_outlined, title: 'No Employees', message: 'No employees found.')
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) {
                    final u = filtered[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFF059669).withOpacity(0.12),
                          child: Text(u.name.substring(0, 1).toUpperCase(), style: const TextStyle(color: Color(0xFF059669), fontWeight: FontWeight.w700)),
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
    ]);
  }
}
