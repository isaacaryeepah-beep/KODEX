import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  final String portal;
  const LoginScreen({super.key, required this.portal});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscurePass = true;

  static const _portalConfig = {
    'student':  {'title': 'Student',   'subtitle': 'Access your courses & attendance', 'role': 'student',  'mode': 'academic',  'color': Color(0xFF4F6EF7), 'icon': Icons.school_outlined},
    'lecturer': {'title': 'Lecturer',  'subtitle': 'Manage your classes & quizzes',    'role': 'lecturer', 'mode': 'academic',  'color': Color(0xFF7C3AED), 'icon': Icons.cast_for_education_outlined},
    'manager':  {'title': 'Manager',   'subtitle': 'Oversee your team & reports',      'role': 'manager',  'mode': 'corporate', 'color': Color(0xFF059669), 'icon': Icons.business_center_outlined},
    'admin':    {'title': 'Admin',     'subtitle': 'Manage institution & users',        'role': 'admin',    'mode': 'academic',  'color': Color(0xFFDC2626), 'icon': Icons.admin_panel_settings_outlined},
    'hod':      {'title': 'HOD',       'subtitle': 'Head of Department portal',         'role': 'hod',      'mode': 'academic',  'color': Color(0xFFF59E0B), 'icon': Icons.supervisor_account_outlined},
    'employee': {'title': 'Employee',  'subtitle': 'Clock in, leaves & shifts',         'role': 'employee', 'mode': 'corporate', 'color': Color(0xFF4F46E5), 'icon': Icons.badge_outlined},
  };

  Map<String, dynamic> get _config =>
      (_portalConfig[widget.portal] ?? _portalConfig['student'])!;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await ref.read(authProvider.notifier).login(
      email: _emailCtrl.text.trim(),
      password: _passCtrl.text,
      loginRole: _config['role'] as String,
      portalMode: _config['mode'] as String,
    );
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ref.read(authProvider).error ?? 'Login failed'),
          backgroundColor: DiklyColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final color = _config['color'] as Color;
    final icon = _config['icon'] as IconData;
    final title = _config['title'] as String;
    final subtitle = _config['subtitle'] as String;

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Background photo ─────────────────────────────────────
          Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xCC050D1F), Color(0xEE071428), Color(0xFF08172E)],
                stops: [0.0, 0.5, 1.0],
              ),
            ),
          ),

          // ── Content ───────────────────────────────────────────────
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              child: Column(
                children: [
                  // Back button row
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => context.pop(),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.white.withOpacity(0.18)),
                          ),
                          child: const Icon(Icons.arrow_back_ios_new_rounded,
                              color: Colors.white70, size: 16),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // ── Logo ─────────────────────────────────────────
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset('assets/icon.png',
                            width: 48, height: 48, fit: BoxFit.cover),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'DIKLY',
                        style: GoogleFonts.dmSans(
                          fontSize: 32,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // ── Glass card ────────────────────────────────────
                  ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: Colors.white.withOpacity(0.18),
                            width: 1.5,
                          ),
                        ),
                        child: Column(
                          children: [
                            // Top accent bar in role color
                            Container(
                              height: 4,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [color, color.withOpacity(0.4)],
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(24, 28, 24, 28),
                              child: Column(
                                children: [
                                  // Role badge
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: color.withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(
                                          color: color.withOpacity(0.4), width: 1),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(icon, color: color, size: 20),
                                        const SizedBox(width: 8),
                                        Text(
                                          '$title Portal',
                                          style: GoogleFonts.dmSans(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            color: color,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'Sign in to your account',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    subtitle,
                                    style: GoogleFonts.dmSans(
                                      fontSize: 13,
                                      color: Colors.white60,
                                    ),
                                  ),
                                  const SizedBox(height: 28),

                                  // ── Form ─────────────────────────
                                  Form(
                                    key: _formKey,
                                    child: Column(
                                      children: [
                                        _GlassField(
                                          controller: _emailCtrl,
                                          label: 'Email address',
                                          icon: Icons.email_outlined,
                                          keyboardType:
                                              TextInputType.emailAddress,
                                          validator: (v) =>
                                              v == null || !v.contains('@')
                                                  ? 'Enter a valid email'
                                                  : null,
                                        ),
                                        const SizedBox(height: 14),
                                        _GlassField(
                                          controller: _passCtrl,
                                          label: 'Password',
                                          icon: Icons.lock_outline_rounded,
                                          obscureText: _obscurePass,
                                          suffixIcon: IconButton(
                                            icon: Icon(
                                              _obscurePass
                                                  ? Icons.visibility_outlined
                                                  : Icons.visibility_off_outlined,
                                              size: 18,
                                              color: Colors.white38,
                                            ),
                                            onPressed: () => setState(
                                                () => _obscurePass = !_obscurePass),
                                          ),
                                          validator: (v) => v == null || v.isEmpty
                                              ? 'Enter your password'
                                              : null,
                                        ),
                                        const SizedBox(height: 8),

                                        // Forgot password
                                        Align(
                                          alignment: Alignment.centerRight,
                                          child: TextButton(
                                            onPressed: () {},
                                            style: TextButton.styleFrom(
                                                padding: EdgeInsets.zero,
                                                minimumSize: Size.zero,
                                                tapTargetSize:
                                                    MaterialTapTargetSize
                                                        .shrinkWrap),
                                            child: Text(
                                              'Forgot password?',
                                              style: GoogleFonts.dmSans(
                                                  fontSize: 12,
                                                  color: color,
                                                  fontWeight: FontWeight.w600),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(height: 20),

                                        // Sign In button
                                        SizedBox(
                                          width: double.infinity,
                                          child: ElevatedButton(
                                            onPressed:
                                                auth.isLoading ? null : _submit,
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: color,
                                              foregroundColor: Colors.white,
                                              padding: const EdgeInsets.symmetric(
                                                  vertical: 15),
                                              shape: RoundedRectangleBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(12)),
                                              elevation: 0,
                                            ),
                                            child: auth.isLoading
                                                ? const SizedBox(
                                                    height: 20,
                                                    width: 20,
                                                    child:
                                                        CircularProgressIndicator(
                                                            strokeWidth: 2,
                                                            color: Colors.white))
                                                : Text(
                                                    'Sign In',
                                                    style: GoogleFonts.dmSans(
                                                        fontSize: 15,
                                                        fontWeight:
                                                            FontWeight.w700),
                                                  ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Back to portal
                  GestureDetector(
                    onTap: () => context.go('/portal'),
                    child: Text(
                      '← Back to portal selection',
                      style: GoogleFonts.dmSans(
                          fontSize: 12,
                          color: Colors.white38,
                          fontWeight: FontWeight.w500),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '© 2026 DIKLY Technologies',
                    style: GoogleFonts.dmSans(
                        fontSize: 11, color: Colors.white24),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Glass-styled text field ───────────────────────────────────────────────────

class _GlassField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType keyboardType;
  final bool obscureText;
  final Widget? suffixIcon;
  final String? Function(String?)? validator;

  const _GlassField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType = TextInputType.text,
    this.obscureText = false,
    this.suffixIcon,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      autocorrect: false,
      style: GoogleFonts.dmSans(color: Colors.white, fontSize: 14),
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.dmSans(color: Colors.white54, fontSize: 13),
        hintStyle: GoogleFonts.dmSans(color: Colors.white30, fontSize: 13),
        prefixIcon: Icon(icon, color: Colors.white38, size: 18),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: Colors.white.withOpacity(0.08),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.18), width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.18), width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.white54, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: DiklyColors.error, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: DiklyColors.error, width: 1.5),
        ),
        errorStyle: GoogleFonts.dmSans(color: const Color(0xFFFF8FA3), fontSize: 11),
      ),
    );
  }
}
