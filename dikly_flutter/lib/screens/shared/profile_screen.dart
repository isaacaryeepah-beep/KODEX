import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/user.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Profile'),
        leading: BackButton(onPressed: () => context.pop()),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => _showLogoutDialog(context, ref),
            tooltip: 'Logout',
          ),
        ],
      ),
      body: user == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Avatar + name
                Center(
                  child: Column(
                    children: [
                      Container(
                        width: 90,
                        height: 90,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [DiklyColors.primary, DiklyColors.primaryDark],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: DiklyColors.primary.withOpacity(0.3), blurRadius: 16, offset: const Offset(0, 6))],
                        ),
                        child: Center(
                          child: Text(
                            _getInitials(user.name),
                            style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(user.name, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(user.email, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary)),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: _getRoleColor(user.role).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: _getRoleColor(user.role).withOpacity(0.3)),
                        ),
                        child: Text(
                          user.role.toUpperCase(),
                          style: TextStyle(color: _getRoleColor(user.role), fontWeight: FontWeight.w700, fontSize: 12, letterSpacing: 1),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                // Info card
                _InfoCard(title: 'Account Details', children: [
                  _InfoRow(icon: Icons.person_outline_rounded, label: 'Full Name', value: user.name),
                  _InfoRow(icon: Icons.email_outlined, label: 'Email', value: user.email),
                  _InfoRow(icon: Icons.badge_outlined, label: 'Role', value: user.role),
                  if (user.portalMode != null) _InfoRow(icon: Icons.layers_outlined, label: 'Portal', value: user.portalMode!),
                  if (user.phone != null && user.phone!.isNotEmpty) _InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: user.phone!),
                  if (user.department != null && user.department!.isNotEmpty) _InfoRow(icon: Icons.apartment_outlined, label: 'Department', value: user.department!),
                ]),
                const SizedBox(height: 16),
                // Actions
                _ActionCard(title: 'Settings', children: [
                  _ActionTile(icon: Icons.dark_mode_outlined, label: 'Appearance', onTap: () {}),
                  _ActionTile(icon: Icons.notifications_outlined, label: 'Notifications', onTap: () {}),
                  _ActionTile(icon: Icons.lock_outline_rounded, label: 'Change Password', onTap: () {}),
                  _ActionTile(icon: Icons.help_outline_rounded, label: 'Help & Support', onTap: () {}),
                ]),
                const SizedBox(height: 16),
                // Logout
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _showLogoutDialog(context, ref),
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Logout'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DiklyColors.error,
                      side: const BorderSide(color: DiklyColors.error),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }

  String _getInitials(String name) {
    final parts = name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  Color _getRoleColor(String role) {
    switch (role) {
      case 'student': return DiklyColors.primary;
      case 'lecturer': return const Color(0xFF7C3AED);
      case 'manager': return const Color(0xFF0D9488);
      case 'admin': return const Color(0xFFD97706);
      case 'hod': return const Color(0xFFDC2626);
      default: return DiklyColors.textSecondary;
    }
  }

  void _showLogoutDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(authProvider.notifier).logout();
            },
            style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.error),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _InfoCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: DiklyColors.textSecondary),
          const SizedBox(width: 12),
          SizedBox(width: 90, child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary))),
          Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _ActionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionTile({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, size: 20, color: DiklyColors.textSecondary),
      title: Text(label, style: Theme.of(context).textTheme.bodyMedium),
      trailing: const Icon(Icons.chevron_right_rounded, size: 18, color: DiklyColors.textSecondary),
      onTap: onTap,
    );
  }
}
