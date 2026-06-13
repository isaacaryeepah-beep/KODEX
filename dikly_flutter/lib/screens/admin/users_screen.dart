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
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await apiService.getUsers();
      setState(() {
        _users = users;
        _filter();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
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

  Future<void> _showAddUserSheet() async {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    String selectedRole = 'student';
    bool saving = false;
    String? sheetError;

    await showModalBottomSheet(
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
                  style: GoogleFonts.dmSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Fill in the details to create a new user account.',
                  style: GoogleFonts.dmSans(
                    fontSize: 13,
                    color: DiklyColors.textLight,
                  ),
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
                            child: Text(
                              r[0].toUpperCase() + r.substring(1),
                              style: GoogleFonts.dmSans(fontSize: 14),
                            ),
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
                  Text(
                    sheetError!,
                    style: GoogleFonts.dmSans(
                      fontSize: 13,
                      color: DiklyColors.error,
                    ),
                  ),
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
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      textStyle: GoogleFonts.dmSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: saving
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Create User'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );

    await _loadData();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('User created successfully'),
          backgroundColor: DiklyColors.success,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final studentCount = _users.where((u) => u.role == 'student').length;
    final deptCount = _users.map((u) => u.department).where((d) => d != null && d.isNotEmpty).toSet().length;

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: Column(
        children: [
          // Header + action buttons
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
              ],
            ),
          ),

          // Search + Filters
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search departments, names, index numbers...',
                    hintStyle: GoogleFonts.dmSans(
                      fontSize: 14,
                      color: DiklyColors.textMuted,
                    ),
                    prefixIcon: const Icon(Icons.search_outlined, size: 20, color: DiklyColors.textMuted),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              _filter();
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
                      borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _roles.map((role) {
                      final selected = _filterRole == role;
                      final label = role == 'all' ? 'All' : role[0].toUpperCase() + role.substring(1);
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: GestureDetector(
                          onTap: () => setState(() {
                            _filterRole = role;
                            _filter();
                          }),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: selected ? DiklyColors.primary : DiklyColors.background,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: selected ? DiklyColors.primary : DiklyColors.border,
                              ),
                            ),
                            child: Text(
                              label,
                              style: GoogleFonts.dmSans(
                                fontSize: 12,
                                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                                color: selected ? Colors.white : DiklyColors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: DiklyColors.border),

          // List
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                              const SizedBox(height: 12),
                              Text(
                                'Failed to load users',
                                style: GoogleFonts.dmSans(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w600,
                                  color: DiklyColors.text,
                                ),
                              ),
                              const SizedBox(height: 16),
                              ElevatedButton.icon(
                                onPressed: _loadData,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: DiklyColors.primary,
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                ),
                                icon: const Icon(Icons.refresh, size: 16),
                                label: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _filtered.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.people_outlined,
                            iconColor: DiklyColors.textLight,
                            iconBg: DiklyColors.background,
                            title: 'No users found',
                            subtitle: _filterRole == 'all'
                                ? 'Users will appear here once added.'
                                : 'No ${_filterRole}s match your search.',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            color: DiklyColors.primary,
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) =>
                                  _UserCard(user: _filtered[index]),
                            ),
                          ),
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
      case 'student':
        return DiklyColors.primary;
      case 'lecturer':
        return const Color(0xFF7C3AED);
      case 'admin':
        return const Color(0xFF0F172A);
      case 'manager':
        return const Color(0xFF0D9488);
      case 'hod':
        return DiklyColors.error;
      case 'employee':
        return DiklyColors.warning;
      default:
        return DiklyColors.textLight;
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
            radius: 22,
            backgroundColor: _roleColor.withOpacity(0.12),
            child: Text(
              _initials,
              style: GoogleFonts.dmSans(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: _roleColor,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  style: GoogleFonts.dmSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  user.email,
                  style: GoogleFonts.dmSans(
                    fontSize: 12,
                    color: DiklyColors.textLight,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (user.department != null && user.department!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    user.department!,
                    style: GoogleFonts.dmSans(
                      fontSize: 11,
                      color: DiklyColors.textMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              DiklyBadge(
                label: user.role.toUpperCase(),
                color: _roleColor,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
