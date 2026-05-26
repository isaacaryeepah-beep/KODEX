import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';

const _portalInfo = {
  'student': {
    'title': 'Student Login',
    'icon': Icons.school_rounded,
    'color': Color(0xFF2563EB),
    'loginRole': 'student',
    'portalMode': 'academic',
  },
  'lecturer': {
    'title': 'Lecturer Login',
    'icon': Icons.person_rounded,
    'color': Color(0xFF7C3AED),
    'loginRole': 'lecturer',
    'portalMode': 'academic',
  },
  'manager': {
    'title': 'Manager Login',
    'icon': Icons.business_center_rounded,
    'color': Color(0xFF0D9488),
    'loginRole': 'manager',
    'portalMode': 'corporate',
  },
  'hod': {
    'title': 'Head of Dept Login',
    'icon': Icons.account_balance_rounded,
    'color': Color(0xFFDC2626),
    'loginRole': 'hod',
    'portalMode': 'academic',
  },
  'admin': {
    'title': 'Admin Login',
    'icon': Icons.admin_panel_settings_rounded,
    'color': Color(0xFFD97706),
    'loginRole': 'admin',
    'portalMode': 'academic',
  },
  'employee': {
    'title': 'Employee Login',
    'icon': Icons.badge_outlined,
    'color': Color(0xFF0D9488),
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
      _portalInfo[widget.role] ?? _portalInfo['student']!;

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
      final error = ref.read(authProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error ?? 'Login failed'),
          backgroundColor: DiklyColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final color = _info['color'] as Color;
    final icon = _info['icon'] as IconData;
    final title = _info['title'] as String;

    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 12),
              // Back
              GestureDetector(
                onTap: () => context.pop(),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.arrow_back_ios_rounded, size: 16, color: DiklyColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      'Back',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: DiklyColors.textSecondary,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              // Icon + Title
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, color: color, size: 30),
              ),
              const SizedBox(height: 20),
              Text(
                title,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.textPrimary,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                'Enter your credentials to continue',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: DiklyColors.textSecondary,
                    ),
              ),
              const SizedBox(height: 36),
              // Form
              Form(
                key: _formKey,
                child: Column(
                  children: [
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Email Address',
                        prefixIcon: Icon(Icons.email_outlined, size: 20),
                      ),
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Please enter your email';
                        }
                        if (!value.contains('@')) {
                          return 'Please enter a valid email';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                        suffixIcon: GestureDetector(
                          onTap: () =>
                              setState(() => _obscurePassword = !_obscurePassword),
                          child: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            size: 20,
                            color: DiklyColors.textSecondary,
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
                    const SizedBox(height: 28),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: authState.isLoading ? null : _login,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: color,
                          padding: const EdgeInsets.symmetric(vertical: 16),
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
                            : const Text('Sign In', style: TextStyle(fontSize: 16)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Center(
                child: Text(
                  'DIKLY Platform v1.0',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: DiklyColors.textSecondary,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
