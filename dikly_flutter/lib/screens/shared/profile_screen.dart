import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _nameCtrl = TextEditingController();
  final _currentPwCtrl = TextEditingController();
  final _newPwCtrl = TextEditingController();
  final _confirmPwCtrl = TextEditingController();
  bool _saving = false;
  bool _changingPassword = false;
  bool _showCurrentPw = false;
  bool _showNewPw = false;
  bool _showConfirmPw = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _currentPwCtrl.dispose();
    _newPwCtrl.dispose();
    _confirmPwCtrl.dispose();
    super.dispose();
  }

  String _getInitials(String name) {
    final parts = name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  void _showLogoutDialog() {
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
            child: const Text('Logout', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _saveChanges() async {
    final newName = _nameCtrl.text.trim();
    if (newName.isEmpty) {
      _showSnack('Name cannot be empty', isError: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await apiService.updateProfile({'name': newName});
      // Refresh cached user in auth state
      ref.read(authProvider.notifier).refreshUser();
      if (!mounted) return;
      _showSnack('Profile updated successfully');
    } catch (e) {
      if (!mounted) return;
      _showSnack(
        e.toString().contains('404')
            ? 'Profile update is not available — contact your admin.'
            : 'Failed to update profile. Please try again.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePassword() async {
    final current = _currentPwCtrl.text.trim();
    final newPw = _newPwCtrl.text.trim();
    final confirm = _confirmPwCtrl.text.trim();

    if (current.isEmpty || newPw.isEmpty || confirm.isEmpty) {
      _showSnack('Please fill in all password fields', isError: true);
      return;
    }
    if (newPw.length < 8) {
      _showSnack('New password must be at least 8 characters', isError: true);
      return;
    }
    if (newPw != confirm) {
      _showSnack('Passwords do not match', isError: true);
      return;
    }

    setState(() => _changingPassword = true);
    try {
      await apiService.changePassword(
        currentPassword: current,
        newPassword: newPw,
      );
      if (!mounted) return;
      _currentPwCtrl.clear();
      _newPwCtrl.clear();
      _confirmPwCtrl.clear();
      _showSnack('Password changed successfully');
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString();
      _showSnack(
        msg.contains('401') || msg.contains('incorrect') || msg.contains('wrong')
            ? 'Current password is incorrect.'
            : 'Failed to change password. Please try again.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? DiklyColors.error : DiklyColors.success,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  InputDecoration _inputDeco({String? hint, bool readOnly = false, Widget? suffixIcon}) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: readOnly ? DiklyColors.background : DiklyColors.surface,
      suffixIcon: suffixIcon,
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
        borderSide: readOnly
            ? const BorderSide(color: DiklyColors.border)
            : const BorderSide(color: DiklyColors.primary, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      hintStyle: const TextStyle(color: DiklyColors.textMuted, fontSize: 14),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    if (user != null && _nameCtrl.text.isEmpty) {
      _nameCtrl.text = user.name;
    }

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('My Profile'),
        leading: BackButton(onPressed: () => context.pop()),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            onPressed: _showLogoutDialog,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: user == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // ── Profile avatar + name + role ─────────────────────────
                DiklyCard(
                  child: Column(
                    children: [
                      Stack(
                        children: [
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: DiklyColors.primary,
                            child: Text(
                              _getInitials(user.name),
                              style: const TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                color: DiklyColors.primary,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2),
                              ),
                              child: const Icon(Icons.camera_alt, size: 13, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        user.name,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        user.email,
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      // Role badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          user.role.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFFD97706),
                          ),
                        ),
                      ),
                      // Portal mode chip if set
                      if (user.portalMode != null) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: DiklyColors.primaryULight,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            user.portalMode!.toUpperCase(),
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: DiklyColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ── Account info chips (index no, department, company) ────
                if (user.indexNumber != null ||
                    user.department != null ||
                    user.company != null ||
                    user.phone != null) ...[
                  DiklyCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Account Info',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: DiklyColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (user.indexNumber != null)
                          _InfoRow(icon: Icons.badge_outlined, label: 'Index Number', value: user.indexNumber!),
                        if (user.department != null)
                          _InfoRow(icon: Icons.account_tree_outlined, label: 'Department', value: user.department!),
                        if (user.company != null)
                          _InfoRow(icon: Icons.business_outlined, label: 'Organisation', value: user.company!),
                        if (user.phone != null)
                          _InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: user.phone!),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],

                // ── Edit profile ─────────────────────────────────────────
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Account Details',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 16),

                      const DiklySectionLabel('FULL NAME'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _nameCtrl,
                        decoration: _inputDeco(hint: 'Your full name'),
                      ),
                      const SizedBox(height: 14),

                      const DiklySectionLabel('DEPARTMENT'),
                      const SizedBox(height: 6),
                      TextFormField(
                        initialValue: user.department ?? '',
                        readOnly: true,
                        style: const TextStyle(color: DiklyColors.textSecondary),
                        decoration: _inputDeco(hint: 'Not set', readOnly: true),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Department cannot be changed here — contact your admin.',
                        style: TextStyle(fontSize: 11, color: DiklyColors.textMuted),
                      ),
                      const SizedBox(height: 14),

                      const DiklySectionLabel('EMAIL'),
                      const SizedBox(height: 6),
                      TextFormField(
                        initialValue: user.email,
                        readOnly: true,
                        style: const TextStyle(color: DiklyColors.textSecondary),
                        decoration: _inputDeco(readOnly: true),
                      ),
                      const SizedBox(height: 20),

                      DiklyPrimaryButton(
                        label: 'Save Changes',
                        loading: _saving,
                        onPressed: _saveChanges,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ── Change Password ──────────────────────────────────────
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Change Password',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 16),

                      const DiklySectionLabel('CURRENT PASSWORD'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _currentPwCtrl,
                        obscureText: !_showCurrentPw,
                        decoration: _inputDeco(
                          hint: 'Enter current password',
                          suffixIcon: IconButton(
                            icon: Icon(
                              _showCurrentPw ? Icons.visibility_off : Icons.visibility,
                              size: 18,
                              color: DiklyColors.textLight,
                            ),
                            onPressed: () => setState(() => _showCurrentPw = !_showCurrentPw),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),

                      const DiklySectionLabel('NEW PASSWORD'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _newPwCtrl,
                        obscureText: !_showNewPw,
                        decoration: _inputDeco(
                          hint: 'Min 8 characters',
                          suffixIcon: IconButton(
                            icon: Icon(
                              _showNewPw ? Icons.visibility_off : Icons.visibility,
                              size: 18,
                              color: DiklyColors.textLight,
                            ),
                            onPressed: () => setState(() => _showNewPw = !_showNewPw),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),

                      const DiklySectionLabel('CONFIRM NEW PASSWORD'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _confirmPwCtrl,
                        obscureText: !_showConfirmPw,
                        decoration: _inputDeco(
                          hint: 'Repeat new password',
                          suffixIcon: IconButton(
                            icon: Icon(
                              _showConfirmPw ? Icons.visibility_off : Icons.visibility,
                              size: 18,
                              color: DiklyColors.textLight,
                            ),
                            onPressed: () => setState(() => _showConfirmPw = !_showConfirmPw),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),

                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _changingPassword ? null : _changePassword,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF7C3AED),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            elevation: 0,
                          ),
                          child: _changingPassword
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation(Colors.white),
                                  ),
                                )
                              : const Text(
                                  'Change Password',
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // ── Logout button ────────────────────────────────────────
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _showLogoutDialog,
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Logout'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DiklyColors.error,
                      side: const BorderSide(color: DiklyColors.error),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }
}

// ── Info Row ────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 16, color: DiklyColors.textLight),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: DiklyColors.textLight,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: DiklyColors.text,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
