import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminSearchScreen extends StatefulWidget {
  const AdminSearchScreen({super.key});

  @override
  State<AdminSearchScreen> createState() => _AdminSearchScreenState();
}

class _AdminSearchScreenState extends State<AdminSearchScreen> {
  final _ctrl = TextEditingController();
  String _selectedRole = 'all';
  List<Map<String, dynamic>> _results = [];
  bool _loading = false;
  String? _error;
  bool _searched = false;

  static const _roles = ['all', 'student', 'lecturer', 'admin'];

  Future<void> _search() async {
    final q = _ctrl.text.trim();
    if (q.length < 2) return;
    setState(() { _loading = true; _error = null; _searched = true; });
    try {
      final results = await apiService.searchUsers(q, role: _selectedRole == 'all' ? null : _selectedRole);
      setState(() { _results = results; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Search', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Find students, lecturers, or staff quickly',
                  style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _ctrl,
                        onSubmitted: (_) => _search(),
                        decoration: InputDecoration(
                          hintText: 'Search by name, email, index number...',
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
                            borderSide: const BorderSide(color: Color(0xFF2563EB)),
                          ),
                          filled: true,
                          fillColor: const Color(0xFFF9FAFB),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _search,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        elevation: 0,
                      ),
                      child: const Text('Search', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: _roles.map((r) {
                    final label = r == 'all' ? 'All' : '${r[0].toUpperCase()}${r.substring(1)}s';
                    final isSelected = _selectedRole == r;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () => setState(() => _selectedRole = r),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            color: isSelected ? const Color(0xFF2563EB) : const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(label,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: isSelected ? Colors.white : const Color(0xFF6B7280),
                            )),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                ? Center(child: Text(_error!, style: const TextStyle(color: DiklyColors.error)))
                : !_searched
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.search, size: 48, color: Colors.grey.shade300),
                          const SizedBox(height: 12),
                          const Text('Enter a name, email, or index number to search',
                            style: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                            textAlign: TextAlign.center),
                        ],
                      ),
                    )
                  : _results.isEmpty
                    ? const Center(child: Text('No results found', style: TextStyle(color: Color(0xFF6B7280))))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _results.length,
                        itemBuilder: (_, i) => _UserCard(user: _results[i]),
                      ),
          ),
        ],
      ),
    );
  }
}

class _UserCard extends StatelessWidget {
  final Map<String, dynamic> user;
  const _UserCard({required this.user});

  @override
  Widget build(BuildContext context) {
    final name = user['name']?.toString() ?? 'Unknown';
    final email = user['email']?.toString() ?? '';
    final role = user['role']?.toString() ?? '';
    final dept = user['department']?.toString() ?? '';
    final index = user['IndexNumber']?.toString() ?? user['indexNumber']?.toString() ?? '';
    final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';

    Color roleColor;
    switch (role.toLowerCase()) {
      case 'student': roleColor = const Color(0xFF2563EB); break;
      case 'lecturer': roleColor = const Color(0xFF7C3AED); break;
      case 'admin': roleColor = const Color(0xFFDC2626); break;
      default: roleColor = const Color(0xFF6B7280);
    }

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: roleColor.withOpacity(0.1),
            child: Text(initials, style: TextStyle(fontWeight: FontWeight.w700, color: roleColor, fontSize: 14)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF111827))),
                if (email.isNotEmpty) Text(email, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                if (index.isNotEmpty) Text('Index: $index', style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                if (dept.isNotEmpty) Text(dept, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
              ],
            ),
          ),
          if (role.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: roleColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(role.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: roleColor)),
            ),
        ],
      ),
    );
  }
}
