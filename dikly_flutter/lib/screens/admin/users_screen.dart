import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  List<User> _users = [];
  List<User> _filtered = [];
  bool _loading = true;
  String? _error;
  String _filterRole = 'all';
  final _searchController = TextEditingController();

  final _roles = ['all', 'student', 'lecturer', 'manager', 'admin', 'hod', 'employee'];

  @override
  void initState() {
    super.initState();
    _loadData();
    _searchController.addListener(_filter);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final users = await apiService.getUsers();
      setState(() { _users = users; _filter(); _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _filter() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      _filtered = _users.where((u) {
        final matchesRole = _filterRole == 'all' || u.role == _filterRole;
        final matchesSearch = query.isEmpty ||
            u.name.toLowerCase().contains(query) ||
            u.email.toLowerCase().contains(query);
        return matchesRole && matchesSearch;
      }).toList();
    });
  }

  Future<void> _showCreateUserDialog() async {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    String selectedRole = 'student';

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Create User'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Full Name')),
                const SizedBox(height: 12),
                TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 12),
                TextField(controller: passCtrl, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedRole,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: ['student', 'lecturer', 'manager', 'admin', 'hod', 'employee'].map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                  onChanged: (v) => setDialogState(() => selectedRole = v ?? 'student'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
          ],
        ),
      ),
    );

    if (result != true) return;
    try {
      await apiService.createUser({
        'name': nameCtrl.text.trim(),
        'email': emailCtrl.text.trim(),
        'password': passCtrl.text,
        'role': selectedRole,
      });
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('User created!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Users',
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateUserDialog,
        child: const Icon(Icons.person_add_rounded),
      ),
      child: Column(
        children: [
          Container(
            color: DiklyColors.surface,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: TextField(
                    controller: _searchController,
                    decoration: const InputDecoration(
                      hintText: 'Search users...',
                      prefixIcon: Icon(Icons.search_rounded),
                      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    ),
                  ),
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Row(
                    children: _roles.map((role) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(role == 'all' ? 'All' : role[0].toUpperCase() + role.substring(1)),
                        selected: _filterRole == role,
                        onSelected: (_) => setState(() { _filterRole = role; _filter(); }),
                        selectedColor: DiklyColors.primary.withOpacity(0.15),
                        checkmarkColor: DiklyColors.primary,
                        labelStyle: TextStyle(
                          color: _filterRole == role ? DiklyColors.primary : DiklyColors.textPrimary,
                          fontWeight: _filterRole == role ? FontWeight.w600 : FontWeight.w400,
                          fontSize: 12,
                        ),
                      ),
                    )).toList(),
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const LoadingList()
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                          const SizedBox(height: 12),
                          Text(_error!),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                        ],
                      ))
                    : _filtered.isEmpty
                        ? const EmptyState(icon: Icons.people_outlined, title: 'No users found', subtitle: 'Users will appear here')
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) => _UserTile(user: _filtered[index]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  final User user;
  const _UserTile({required this.user});

  Color get _roleColor {
    switch (user.role) {
      case 'student': return DiklyColors.primary;
      case 'lecturer': return const Color(0xFF7C3AED);
      case 'admin': return DiklyColors.warning;
      case 'manager': return const Color(0xFF0D9488);
      case 'hod': return const Color(0xFFDC2626);
      default: return DiklyColors.textSecondary;
    }
  }

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: _roleColor.withOpacity(0.1),
            child: Text(_initials, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _roleColor)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text(user.email, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary), overflow: TextOverflow.ellipsis),
                if (user.department != null)
                  Text(user.department!, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: _roleColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(user.role.toUpperCase(), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: _roleColor, letterSpacing: 0.5)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
