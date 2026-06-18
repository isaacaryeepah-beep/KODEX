import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  final _pinCtrl = TextEditingController();
  final _pinConfirmCtrl = TextEditingController();
  bool _saving = false;
  bool _changingPassword = false;
  bool _showCurrentPw = false;
  bool _showNewPw = false;
  bool _showConfirmPw = false;
  bool _savingPin = false;
  bool? _twoFactorEnabled;
  List<Map<String, dynamic>> _devices = [];
  bool _devicesLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDevices();
  }

  Future<void> _loadDevices() async {
    try {
      final data = await apiService.getMyDevices();
      if (mounted) {
        setState(() {
          _devices = ((data['devices'] as List?) ?? []).cast<Map<String, dynamic>>();
          _devicesLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _devicesLoading = false);
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _currentPwCtrl.dispose();
    _newPwCtrl.dispose();
    _confirmPwCtrl.dispose();
    _pinCtrl.dispose();
    _pinConfirmCtrl.dispose();
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

  Future<void> _toggle2FA(bool enable) async {
    setState(() => _twoFactorEnabled = enable);
    try {
      await apiService.toggle2FA(enable);
      _showSnack(enable ? '2FA enabled — you will receive a code by email on each login' : '2FA disabled');
    } catch (e) {
      setState(() => _twoFactorEnabled = !enable);
      _showSnack('Failed to update 2FA', isError: true);
    }
  }

  Future<void> _savePin() async {
    final pin = _pinCtrl.text.trim();
    final confirm = _pinConfirmCtrl.text.trim();
    if (!RegExp(r'^\d{4}$').hasMatch(pin)) {
      _showSnack('PIN must be exactly 4 digits', isError: true);
      return;
    }
    if (pin != confirm) {
      _showSnack('PINs do not match', isError: true);
      return;
    }
    setState(() => _savingPin = true);
    try {
      await apiService.setClassRepPin(pin);
      _pinCtrl.clear();
      _pinConfirmCtrl.clear();
      _showSnack('PIN saved — class rep can now use it on the device');
    } catch (e) {
      _showSnack('Failed to save PIN', isError: true);
    } finally {
      if (mounted) setState(() => _savingPin = false);
    }
  }

  Future<void> _removeDevice(String deviceId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove Device'),
        content: const Text('Remove this device from your trusted list?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.error, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await apiService.removeMyDevice(deviceId);
      _showSnack('Device removed');
      await _loadDevices();
    } catch (e) {
      _showSnack('Failed to remove device', isError: true);
    }
  }

  String _timeAgo(String? dateStr) {
    if (dateStr == null) return 'Unknown';
    final dt = DateTime.tryParse(dateStr);
    if (dt == null) return 'Unknown';
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
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
                DiklyScreenHeader(
                  title: 'My Profile',
                  subtitle: 'Manage your account details',
                ),
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

                      const DiklySectionLabel('DEPARTMENT (CANNOT BE CHANGED HERE — CONTACT ADMIN)'),
                      const SizedBox(height: 6),
                      TextFormField(
                        initialValue: (user.department ?? '').toUpperCase(),
                        readOnly: true,
                        style: const TextStyle(color: DiklyColors.textSecondary),
                        decoration: _inputDeco(hint: 'Not set', readOnly: true),
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
                const SizedBox(height: 12),

                // ── Two-Factor Authentication ────────────────────────────
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Two-Factor Authentication',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: DiklyColors.background,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: DiklyColors.border),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: const [
                                  Text('Email 2FA', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                  SizedBox(height: 2),
                                  Text('Send a code to your email every time you sign in', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                                ],
                              ),
                            ),
                            Switch(
                              value: _twoFactorEnabled ?? (user.twoFactorEnabled),
                              onChanged: _toggle2FA,
                              activeColor: DiklyColors.primary,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ── Class Rep PIN (lecturers only) ───────────────────────
                if (user.isLecturer)
                  DiklyCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Class Rep PIN',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Set a 4-digit PIN that your class rep must enter to connect the attendance device to your session. Leave blank to allow connection without a PIN.',
                          style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary, height: 1.5),
                        ),
                        const SizedBox(height: 14),
                        const DiklySectionLabel('NEW PIN'),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _pinCtrl,
                          obscureText: true,
                          keyboardType: TextInputType.number,
                          maxLength: 4,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: _inputDeco(hint: '4 digits').copyWith(counterText: ''),
                        ),
                        const SizedBox(height: 10),
                        const DiklySectionLabel('CONFIRM PIN'),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _pinConfirmCtrl,
                          obscureText: true,
                          keyboardType: TextInputType.number,
                          maxLength: 4,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: _inputDeco(hint: 'Repeat PIN').copyWith(counterText: ''),
                        ),
                        const SizedBox(height: 16),
                        DiklyPrimaryButton(
                          label: 'Save PIN',
                          loading: _savingPin,
                          onPressed: _savePin,
                        ),
                      ],
                    ),
                  ),
                if (user.isLecturer) const SizedBox(height: 12),

                // ── Signed-in Devices ────────────────────────────────────
                DiklyCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Signed-in Devices',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'All devices that have logged into your account',
                        style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                      ),
                      const SizedBox(height: 14),
                      if (_devicesLoading)
                        const Center(child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 12),
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ))
                      else if (_devices.isEmpty)
                        const Text('No devices found', style: TextStyle(fontSize: 13, color: DiklyColors.textMuted))
                      else
                        ..._devices.map((d) {
                          final isCurrent = d['isCurrent'] == true;
                          final platform = d['platform']?.toString() ?? 'unknown';
                          final platformLabel = platform.isNotEmpty ? '${platform[0].toUpperCase()}${platform.substring(1)}' : 'Unknown';
                          final ip = d['ipAddress']?.toString() ?? '';
                          final lastSeen = _timeAgo(d['lastSeenAt']?.toString());
                          final userAgent = d['userAgent']?.toString() ?? '';
                          final deviceId = d['deviceId']?.toString() ?? '';
                          final icon = platform == 'mobile' ? Icons.smartphone_outlined
                              : platform == 'desktop' ? Icons.laptop_outlined
                              : Icons.devices_outlined;
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isCurrent ? DiklyColors.primary.withOpacity(0.04) : DiklyColors.background,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: isCurrent ? DiklyColors.primary : DiklyColors.border, width: isCurrent ? 1.5 : 1),
                            ),
                            child: Row(
                              children: [
                                Icon(icon, size: 28, color: isCurrent ? DiklyColors.primary : DiklyColors.textSecondary),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(platformLabel, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                          if (isCurrent) ...[
                                            const SizedBox(width: 8),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                              decoration: BoxDecoration(color: DiklyColors.primary, borderRadius: BorderRadius.circular(20)),
                                              child: const Text('Current', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w700)),
                                            ),
                                          ],
                                        ],
                                      ),
                                      if (ip.isNotEmpty) Text('$ip · $lastSeen', style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                                      if (userAgent.isNotEmpty)
                                        Text(userAgent, style: const TextStyle(fontSize: 10, color: DiklyColors.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    ],
                                  ),
                                ),
                                if (!isCurrent && deviceId.isNotEmpty)
                                  TextButton(
                                    onPressed: () => _removeDevice(deviceId),
                                    style: TextButton.styleFrom(
                                      foregroundColor: DiklyColors.error,
                                      side: const BorderSide(color: DiklyColors.error),
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                    ),
                                    child: const Text('Remove', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                  ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ── Danger Zone ──────────────────────────────────────────
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: DiklyColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.error.withOpacity(0.3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Danger Zone', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.error)),
                      const SizedBox(height: 4),
                      const Text('Permanently delete your account and all associated data.', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: () => _showSnack('Contact your administrator to delete your account.', isError: false),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.error,
                          side: const BorderSide(color: DiklyColors.error),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Delete Account', style: TextStyle(fontWeight: FontWeight.w600)),
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
