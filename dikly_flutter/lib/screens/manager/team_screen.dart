import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/ds/dikly_ds.dart';

class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  List<User> _team = [];
  List<User> _filtered = [];
  bool _loading = true;
  String? _error;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
    _searchCtrl.addListener(_onSearch);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearch() {
    final q = _searchCtrl.text.toLowerCase();
    setState(() {
      _filtered = q.isEmpty
          ? _team
          : _team
              .where((u) =>
                  u.name.toLowerCase().contains(q) ||
                  u.email.toLowerCase().contains(q) ||
                  (u.department ?? '').toLowerCase().contains(q))
              .toList();
    });
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final users = await apiService.getUsers();
      setState(() {
        _team = users.where((u) => u.role == 'employee' || u.isCorporate).toList();
        _filtered = _team;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: Column(
        children: [
          // Header + search
          Container(
            color: DiklyColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DiklyScreenHeader(
                  title: 'Team',
                  subtitle: '${_team.length} members',
                  padding: const EdgeInsets.only(bottom: 12),
                ),
                TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Search team members...',
                    prefixIcon: const Icon(Icons.search, size: 20, color: DiklyColors.textLight),
                    filled: true,
                    fillColor: DiklyColors.background,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
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
              ],
            ),
          ),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                            const SizedBox(height: 12),
                            Text(_error!),
                            const SizedBox(height: 16),
                            ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                          ],
                        ),
                      )
                    : _filtered.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.group_outlined,
                            title: _searchCtrl.text.isNotEmpty ? 'No results found' : 'No team members',
                            subtitle: _searchCtrl.text.isNotEmpty
                                ? 'Try a different search term'
                                : 'Your team will appear here',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _filtered.length,
                              itemBuilder: (context, index) => _TeamMemberCard(user: _filtered[index]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _TeamMemberCard extends StatelessWidget {
  final User user;
  const _TeamMemberCard({required this.user});

  static const _accent = Color(0xFF0891B2);

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          // Avatar with online indicator
          Stack(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: _accent.withOpacity(0.12),
                child: Text(
                  _initials,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: _accent,
                  ),
                ),
              ),
              // Online indicator dot
              Positioned(
                bottom: 1,
                right: 1,
                child: Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    color: DiklyColors.success,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
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
                  user.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  user.email,
                  style: const TextStyle(
                    fontSize: 12,
                    color: DiklyColors.textSecondary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (user.department != null && user.department!.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  DiklyBadge(
                    label: user.department!,
                    color: _accent,
                  ),
                ],
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: DiklyColors.textSecondary, size: 20),
        ],
      ),
    );
  }
}
