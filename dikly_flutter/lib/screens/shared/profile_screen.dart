import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }

  Future<void> _saveChanges() async {
    setState(() => _saving = true);
    await Future.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Profile updated')),
    );
  }

  InputDecoration _inputDeco({String? hint, bool readOnly = false}) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: readOnly ? DiklyColors.background : DiklyColors.surface,
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
                // Profile card: large avatar + name + role badge
                DiklyCard(
                  child: Column(
                    children: [
                      // Large 80px CircleAvatar with camera overlay badge
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
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Account Details
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Account Details',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
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
                        decoration: _inputDeco(
                          hint: 'Not set',
                          readOnly: true,
                        ),
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
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Change Password
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Change Password',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                      ),
                      const SizedBox(height: 16),

                      const DiklySectionLabel('CURRENT PASSWORD'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _currentPwCtrl,
                        obscureText: true,
                        decoration: _inputDeco(hint: 'Enter current password'),
                      ),
                      const SizedBox(height: 14),

                      const DiklySectionLabel('NEW PASSWORD'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _newPwCtrl,
                        obscureText: true,
                        decoration: _inputDeco(hint: 'Min 8 characters'),
                      ),
                      const SizedBox(height: 14),

                      const DiklySectionLabel('CONFIRM NEW PASSWORD'),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _confirmPwCtrl,
                        obscureText: true,
                        decoration: _inputDeco(hint: 'Repeat new password'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Save button — full width, blue
                DiklyPrimaryButton(
                  label: 'Save Changes',
                  loading: _saving,
                  onPressed: _saveChanges,
                ),
                const SizedBox(height: 12),

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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }
}
