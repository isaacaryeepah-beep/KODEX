import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/ds/dikly_ds.dart';

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
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final users = await apiService.getUsers();
      setState(() { _users = users; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _users.where((u) {
      if (_search.isEmpty) return true;
      final q = _search.toLowerCase();
      return u.name.toLowerCase().contains(q) || u.email.toLowerCase().contains(q);
    }).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'Employees',
            subtitle: 'Manage team members · ${_users.length} shown',
            action: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1D4ED8),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                elevation: 0,
              ),
              child: Text('Add Employee', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),

          // ── Search ────────────────────────────────────────────────────
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: DiklyColors.border),
            ),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search name / email...',
                hintStyle: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
                prefixIcon: const Icon(Icons.search, size: 18, color: DiklyColors.textMuted),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // ── Employees list ────────────────────────────────────────────
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else if (filtered.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 40),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: DiklyColors.border),
              ),
              child: Center(
                child: Text('No employees found.', style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
              ),
            )
          else
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: DiklyColors.border),
              ),
              child: Column(
                children: filtered.map((u) => _EmployeeRow(user: u, onChanged: _load)).toList(),
              ),
            ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _EmployeeRow extends StatefulWidget {
  final User user;
  final VoidCallback onChanged;
  const _EmployeeRow({required this.user, required this.onChanged});

  @override
  State<_EmployeeRow> createState() => _EmployeeRowState();
}

class _EmployeeRowState extends State<_EmployeeRow> {
  bool _actioning = false;

  Color _roleColor(String role) {
    switch (role.toLowerCase()) {
      case 'admin': return const Color(0xFFDC2626);
      case 'manager': return const Color(0xFF1D4ED8);
      case 'hod': return const Color(0xFF0891B2);
      case 'lecturer': return const Color(0xFFD97706);
      case 'student': return const Color(0xFF7C3AED);
      default: return const Color(0xFF059669);
    }
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete Employee', style: GoogleFonts.dmSans(fontWeight: FontWeight.w700)),
        content: Text('Delete ${widget.user.name}? This cannot be undone.', style: GoogleFonts.dmSans(fontSize: 14)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Color(0xFFDC2626))),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _actioning = true);
    try {
      await apiService.deleteUser(widget.user.id);
      widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: const Color(0xFFDC2626)),
        );
      }
    } finally {
      if (mounted) setState(() => _actioning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.user;
    final initials = u.name.trim().split(' ').map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').take(2).join();
    final roleColor = _roleColor(u.role);
    final employeeId = u.indexNumber ?? '—';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: roleColor.withOpacity(0.1),
                child: Text(initials.isEmpty ? '?' : initials,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: roleColor)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(u.name,
                        style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                    Text(u.email,
                        style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: roleColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(u.role.toUpperCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: roleColor)),
              ),
            ],
          ),
          if (employeeId != '—') ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.only(left: 46),
              child: Text('ID: $employeeId',
                  style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted)),
            ),
          ],
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(left: 46),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF059669).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(u.isApproved ? 'Active' : 'Inactive',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: u.isApproved ? const Color(0xFF059669) : const Color(0xFFDC2626),
                      )),
                ),
                const Spacer(),
                if (_actioning)
                  const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                else ...[
                  _ActionBtn(label: 'Deactivate', color: const Color(0xFFD97706), onTap: () {}),
                  const SizedBox(width: 6),
                  _ActionBtn(label: 'Reset', color: const Color(0xFF7C3AED), onTap: () {}),
                  const SizedBox(width: 6),
                  _ActionBtn(label: 'Delete', color: const Color(0xFFDC2626), onTap: _delete),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionBtn({required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
      ),
    );
  }
}
