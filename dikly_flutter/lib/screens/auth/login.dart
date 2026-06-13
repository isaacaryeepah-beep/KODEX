import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

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
  final String? portalModeOverride;

  const LoginScreen({super.key, required this.role, this.portalModeOverride});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _institutionCodeCtrl = TextEditingController();
  bool _obscurePassword = true;

  Map<String, dynamic> get _info {
    final base = Map<String, dynamic>.from(
        (_portalInfo[widget.role] ?? _portalInfo['student'])! as Map<String, dynamic>);
    if (widget.portalModeOverride != null) {
      base['portalMode'] = widget.portalModeOverride == 'corp' ? 'corporate' : 'academic';
    }
    return base;
  }

  bool get _isStudent => widget.role == 'student';
  bool get _needsInstitutionCode =>
      widget.role == 'student' ||
      widget.role == 'manager' ||
      widget.role == 'employee';

  bool get _isStudent => widget.role == 'student';
  bool get _needsInstitutionCode =>
      widget.role == 'student' ||
      widget.role == 'manager' ||
      widget.role == 'employee';

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _institutionCodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();

    final success = await ref.read(authProvider.notifier).login(
          password: _passwordController.text,
          loginRole: _info['loginRole'] as String,
          portalMode: _info['portalMode'] as String,
          email: _isStudent ? null : _emailController.text.trim(),
          indexNumber: _isStudent
              ? _emailController.text.trim().toUpperCase()
              : null,
          institutionCode: _needsInstitutionCode
              ? _institutionCodeCtrl.text.trim().toUpperCase()
              : null,
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
      backgroundColor: DiklyColors.authBg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 8),

              // ── Back arrow ─────────────────────────────────────────────────
              GestureDetector(
                onTap: () => context.pop(),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: DiklyColors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.arrow_back_ios_rounded,
                        size: 14,
                        color: DiklyColors.textSecondary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Back',
                        style: GoogleFonts.dmSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // ── Logo (small) ───────────────────────────────────────────────
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
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
                  Text(
                    'DIKLY',
                    style: GoogleFonts.dmSans(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF1E1B4B),
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── Login card ─────────────────────────────────────────────────
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Container(
                    padding: const EdgeInsets.all(32),
                    decoration: BoxDecoration(
                      color: DiklyColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: DiklyColors.border,
                        width: 1.5,
                      ),
                      boxShadow: AppTheme.shadowMd,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Role badge chip
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: color.withOpacity(0.10),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(icon, size: 14, color: color),
                              const SizedBox(width: 6),
                              Text(
                                badge,
                                style: GoogleFonts.dmSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: color,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        // "Welcome back"
                        Text(
                          'Welcome back',
                          style: GoogleFonts.dmSans(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: DiklyColors.text,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Sign in to your account',
                          style: GoogleFonts.dmSans(
                            fontSize: 14,
                            color: DiklyColors.textLight,
                          ),
                        ),
                        const SizedBox(height: 28),

                        // Error alert
                        if (authState.error != null) ...[
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              color: DiklyColors.errorLight,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: DiklyColors.error.withOpacity(0.3),
                              ),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.error_outline_rounded,
                                  size: 16,
                                  color: DiklyColors.error,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    authState.error!,
                                    style: GoogleFonts.dmSans(
                                      fontSize: 13,
                                      color: DiklyColors.error,
                                    ),
                                  ),
                                ),
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
                              // Identifier label + field (email or student index number)
                              Text(
                                _isStudent
                                    ? 'Student ID / Index Number'
                                    : 'Email address',
                                style: GoogleFonts.dmSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: DiklyColors.textSecondary,
                                ),
                              ),
                              const SizedBox(height: 6),
                              TextFormField(
                                controller: _emailController,
                                keyboardType: _isStudent
                                    ? TextInputType.text
                                    : TextInputType.emailAddress,
                                autocorrect: false,
                                textCapitalization: _isStudent
                                    ? TextCapitalization.characters
                                    : TextCapitalization.none,
                                style: GoogleFonts.dmSans(
                                  fontSize: 14,
                                  color: DiklyColors.text,
                                ),
                                decoration: InputDecoration(
                                  hintText: _isStudent
                                      ? 'e.g. STU/2021/001'
                                      : 'you@example.com',
                                  prefixIcon: Icon(
                                    _isStudent
                                        ? Icons.badge_outlined
                                        : Icons.email_outlined,
                                    size: 18,
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 12,
                                  ),
                                ),
                                validator: (value) {
                                  if (value == null || value.trim().isEmpty) {
                                    return _isStudent
                                        ? 'Please enter your student ID'
                                        : 'Please enter your email';
                                  }
                                  if (!_isStudent && !value.contains('@')) {
                                    return 'Please enter a valid email';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 18),

                              // Institution Code field (student / manager / employee)
                              if (_needsInstitutionCode) ...[
                                Text(
                                  'Institution Code',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: DiklyColors.textSecondary,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                TextFormField(
                                  controller: _institutionCodeCtrl,
                                  keyboardType: TextInputType.text,
                                  autocorrect: false,
                                  textCapitalization:
                                      TextCapitalization.characters,
                                  style: GoogleFonts.dmSans(
                                    fontSize: 14,
                                    color: DiklyColors.text,
                                  ),
                                  decoration: InputDecoration(
                                    hintText: 'e.g. KNUST2024',
                                    prefixIcon: const Icon(
                                      Icons.account_balance_outlined,
                                      size: 18,
                                    ),
                                    contentPadding:
                                        const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 12,
                                    ),
                                  ),
                                  validator: (value) {
                                    if (value == null ||
                                        value.trim().isEmpty) {
                                      return 'Please enter your institution code';
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 18),
                              ],

                              // Password label + field
                              Text(
                                'Password',
                                style: GoogleFonts.dmSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: DiklyColors.textSecondary,
                                ),
                              ),
                              const SizedBox(height: 6),
                              TextFormField(
                                controller: _passwordController,
                                obscureText: _obscurePassword,
                                style: GoogleFonts.dmSans(
                                  fontSize: 14,
                                  color: DiklyColors.text,
                                ),
                                decoration: InputDecoration(
                                  hintText: '••••••••',
                                  prefixIcon: const Icon(
                                    Icons.lock_outline_rounded,
                                    size: 18,
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 12,
                                  ),
                                  suffixIcon: GestureDetector(
                                    onTap: () => setState(
                                      () => _obscurePassword = !_obscurePassword,
                                    ),
                                    child: Icon(
                                      _obscurePassword
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                      size: 18,
                                      color: DiklyColors.textLight,
                                    ),
                                  ),
                                ),
                                validator: (value) {
                                  if (value == null || value.isEmpty) {
                                    return 'Please enter your password';
                                  }
                                  if (value.length < 4) {
                                    return 'Password too short';
                                  }
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),

                              // Forgot password
                              Align(
                                alignment: Alignment.centerRight,
                                child: GestureDetector(
                                  onTap: () {},
                                  child: Text(
                                    'Forgot password?',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                      color: color,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 20),

                              // Sign In button
                              SizedBox(
                                width: double.infinity,
                                height: 48,
                                child: ElevatedButton(
                                  onPressed:
                                      authState.isLoading ? null : _login,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: color,
                                    foregroundColor: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                  ),
                                  child: authState.isLoading
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2.5,
                                          ),
                                        )
                                      : Text(
                                          'Sign In',
                                          style: GoogleFonts.dmSans(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white,
                                          ),
                                        ),
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

              // Footer
              Center(
                child: Column(
                  children: [
                    Text(
                      'DIKLY · Secure Academic Portal',
                      style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
                    ),
                    const SizedBox(height: 4),
                    GestureDetector(
                      onTap: () => context.go('/portal'),
                      child: Text(
                        'Switch portal',
                        style: GoogleFonts.dmSans(
                          fontSize: 12,
                          color: DiklyColors.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
