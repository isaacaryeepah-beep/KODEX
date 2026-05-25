import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  List<User> _team = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final users = await apiService.getUsers();
      setState(() { _team = users.where((u) => u.role == 'employee' || u.isCorporate).toList(); _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'My Team',
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
              : _team.isEmpty
                  ? const EmptyState(icon: Icons.group_outlined, title: 'No team members', message: 'Your team will appear here')
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: Column(
                        children: [
                          Container(
                            margin: const EdgeInsets.all(16),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0D9488).withOpacity(0.08),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF0D9488).withOpacity(0.2)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(color: const Color(0xFF0D9488).withOpacity(0.2), shape: BoxShape.circle),
                                  child: const Icon(Icons.group_rounded, color: Color(0xFF0D9488), size: 22),
                                ),
                                const SizedBox(width: 12),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${_team.length}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: const Color(0xFF0D9488))),
                                    const Text('Team Members', style: TextStyle(color: DiklyColors.textSecondary, fontSize: 12)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: ListView.builder(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              itemCount: _team.length,
                              itemBuilder: (context, index) => _TeamMemberCard(user: _team[index]),
                            ),
                          ),
                        ],
                      ),
                    ),
    );
  }
}

class _TeamMemberCard extends StatelessWidget {
  final User user;
  const _TeamMemberCard({required this.user});

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: const Color(0xFF0D9488).withOpacity(0.1),
            child: Text(_initials, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF0D9488))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(user.email, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary), overflow: TextOverflow.ellipsis),
                if (user.department != null)
                  Text(user.department!, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: DiklyColors.textSecondary, size: 18),
        ],
      ),
    );
  }
}
