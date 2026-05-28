import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../core/glass_card.dart';

// Role metadata: badge label, icon, accent color
const _portalInfo = {
  'student': {
    'title': 'Student Portal',
    'badge': 'Student Portal',
    'icon': Icons.menu_book_outlined,
    'color': Color(0xFF7C3AED),
    'loginRole': 'student',
    'portalMode': 'academic',
  },
  'lecturer': {
    'title': 'Lecturer Portal',
    'badge': 'Lecturer Portal',
    'icon': Icons.person_outlined,
    'color': Color(0xFF2563EB),
    'loginRole': 'lecturer',
    'portalMode': 'academic',
  },
  'admin': {
    'title': 'Admin Portal',
    'badge': 'Admin Portal',
    'icon': Icons.admin_panel_settings_outlined,
    'color': Color(0xFF0F172A),
    'loginRole': 'admin',
    'portalMode': 'academic',
  },
  'hod': {
    'title': 'HOD Portal',
    'badge': 'HOD Portal',
    'icon': Icons.account_balance_outlined,
    'color': Color(0xFF7C3AED),
    'loginRole': 'hod',
    'portalMode': 'academic',
  },
  'manager': {
    'title': 'Manager Portal',
    'badge': 'Manager Portal',
    'icon': Icons.business_center_outlined,
    'color': Color(0xFF0891B2),
    'loginRole': 'manager',
    'portalMode': 'corporate',
  },
  'employee': {
    'title': 'Employee Portal',
    'badge': 'Employee Portal',
    'icon': Icons.badge_outlined,
    'color': Color(0xFF16A34A),
    'loginRole': 'employee',
    'portalMode': 'corporate',
  },
};

class LoginScreen extends ConsumerStatefulWidget {
  final String role;

  const LoginScreen({super.key, required this.role});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  Map<String, dynamic> get _info =>
      (_portalInfo[widget.role] ?? _portalInfo['student'])!
          as Map<String, dynamic>;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();

    final success = await ref.read(authProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          loginRole: _info['loginRole'] as String,
          portalMode: _info['portalMode'] as String,
        );

    if (!success && mounted) {
      // Error is shown inline via authState.error — nothing extra needed here.
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final color = _info['color'] as Color;
    final icon = _info['icon'] as IconData;
    final badge = _info['badge'] as String;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0F23),
      body: Stack(
        children: [
          // Gradient background
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF0F0F23), Color(0xFF1E1040), Color(0xFF0F1535)],
                stops: [0.0, 0.5, 1.0],
              ),
            ),
          ),
          // Purple glow blob top-right
          Positioned(
            top: -80,
            right: -80,
            child: Container(
              width: 280,
              height: 280,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF6366F1).withOpacity(0.15),
              ),
            ),
          ),
          // Blue glow blob bottom-left
          Positioned(
            bottom: -60,
            left: -60,
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF4F46E5).withOpacity(0.12),
              ),
            ),
          ),
          // Content
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),
                  // Back button (glass style)
                  GestureDetector(
                    onTap: () => context.pop(),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white.withOpacity(0.2)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.arrow_back_ios_rounded, size: 14, color: Colors.white70),
                          const SizedBox(width: 4),
                          Text('Back', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white70)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 28),
                  // Logo
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF6366F1), Color(0xFF4F46E5)],
                          ),
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Center(
                          child: Text(
                            'D',
                            style: GoogleFonts.dmSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1.0,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text('DIKLY', style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: 1)),
                    ],
                  ),
                  const SizedBox(height: 28),
                  // White surface card (not glass — needs to be readable)
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 480),
                      child: Container(
                        padding: const EdgeInsets.all(28),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: const Color(0xFFE4E4E7), width: 1),
                          boxShadow: const [
                            BoxShadow(color: Color(0x40000000), blurRadius: 50, offset: Offset(0, 25)),
                            BoxShadow(color: Color(0x26000000), blurRadius: 20, offset: Offset(0, 8)),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // role badge — light indigo pill
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEEF2FF),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: const Color(0xFFC7D2FE), width: 1),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(icon, size: 13, color: DiklyColors.primary),
                                  const SizedBox(width: 5),
                                  Text(badge, style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.primary)),
                                ],
                              ),
                            ),
                            const SizedBox(height: 20),
                            Text('Welcome back', style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: DiklyColors.text)),
                            const SizedBox(height: 4),
                            Text('Sign in to your account', style: GoogleFonts.dmSans(fontSize: 14, color: DiklyColors.textMuted)),
                            const SizedBox(height: 28),
                            // error alert
                            if (authState.error != null) ...[
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                decoration: BoxDecoration(
                                  color: DiklyColors.errorLight,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: DiklyColors.error.withOpacity(0.3)),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.error_outline_rounded, size: 16, color: DiklyColors.error),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text(authState.error!, style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.error))),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 20),
                            ],
                            // Form
                            Form(
                              key: _formKey,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Email address', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w500, color: DiklyColors.textSecondary)),
                                  const SizedBox(height: 8),
                                  TextFormField(
                                    controller: _emailController,
                                    keyboardType: TextInputType.emailAddress,
                                    autocorrect: false,
                                    style: GoogleFonts.dmSans(fontSize: 14, color: DiklyColors.text),
                                    decoration: const InputDecoration(
                                      hintText: 'you@example.com',
                                      prefixIcon: Icon(Icons.email_outlined, size: 18),
                                    ),
                                    validator: (v) {
                                      if (v == null || v.trim().isEmpty) return 'Please enter your email';
                                      if (!v.contains('@')) return 'Please enter a valid email';
                                      return null;
                                    },
                                  ),
                                  const SizedBox(height: 20),
                                  Text('Password', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w500, color: DiklyColors.textSecondary)),
                                  const SizedBox(height: 8),
                                  TextFormField(
                                    controller: _passwordController,
                                    obscureText: _obscurePassword,
                                    style: GoogleFonts.dmSans(fontSize: 14, color: DiklyColors.text),
                                    decoration: InputDecoration(
                                      hintText: '••••••••',
                                      prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
                                      suffixIcon: GestureDetector(
                                        onTap: () => setState(() => _obscurePassword = !_obscurePassword),
                                        child: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 18, color: DiklyColors.textLight),
                                      ),
                                    ),
                                    validator: (v) {
                                      if (v == null || v.isEmpty) return 'Please enter your password';
                                      if (v.length < 4) return 'Password too short';
                                      return null;
                                    },
                                  ),
                                  const SizedBox(height: 14),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: GestureDetector(
                                      onTap: () {},
                                      child: Text('Forgot password?', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.primary)),
                                    ),
                                  ),
                                  const SizedBox(height: 24),
                                  // Solid indigo sign in button
                                  SizedBox(
                                    width: double.infinity,
                                    height: 52,
                                    child: ElevatedButton(
                                      onPressed: authState.isLoading ? null : _login,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: DiklyColors.primary,
                                        disabledBackgroundColor: const Color(0xFFE4E4E7),
                                        foregroundColor: Colors.white,
                                        shadowColor: Colors.transparent,
                                        elevation: 0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                      ).copyWith(
                                        // Indigo glow shadow when enabled
                                        shadowColor: WidgetStateProperty.resolveWith((s) =>
                                            s.contains(WidgetState.disabled)
                                                ? Colors.transparent
                                                : const Color(0x666366F1)),
                                        elevation: WidgetStateProperty.resolveWith((s) =>
                                            s.contains(WidgetState.disabled) ? 0 : 4),
                                      ),
                                      child: authState.isLoading
                                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                                          : Text('Sign In', style: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
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
                  Center(
                    child: Column(
                      children: [
                        Text('DIKLY · Secure Portal', style: GoogleFonts.dmSans(fontSize: 12, color: const Color(0xFFA1A1AA))),
                        const SizedBox(height: 6),
                        GestureDetector(
                          onTap: () => context.go('/portal'),
                          child: Text('Switch portal', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: const Color(0xFF818CF8))),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
