import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
    'student':  {'title': 'Student Portal',   'role': 'student',  'mode': 'academic',  'color': DiklyColors.primary,   'icon': Icons.school_outlined},
    'lecturer': {'title': 'Lecturer Portal',  'role': 'lecturer', 'mode': 'academic',  'color': Color(0xFFD97706),     'icon': Icons.cast_for_education_outlined},
    'manager':  {'title': 'Manager Portal',   'role': 'manager',  'mode': 'corporate', 'color': Color(0xFF1D4ED8),     'icon': Icons.business_center_outlined},
    'admin':    {'title': 'Admin Portal',     'role': 'admin',    'mode': 'academic',  'color': Color(0xFFDC2626),     'icon': Icons.admin_panel_settings_outlined},
    'hod':      {'title': 'HOD Portal',       'role': 'hod',      'mode': 'academic',  'color': Color(0xFF0891B2),     'icon': Icons.supervisor_account_outlined},
    'employee': {'title': 'Employee Portal',  'role': 'employee', 'mode': 'corporate', 'color': Color(0xFF059669),     'icon': Icons.badge_outlined},
  };

  Map<String, dynamic> get _config => (_portalConfig[widget.portal] ?? _portalConfig['student'])!;

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

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios, size: 18),
          onPressed: () => context.canPop() ? context.pop() : context.go('/portal'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Icon(icon, color: color, size: 32),
              ),
              const SizedBox(height: 20),
              Text(
                title,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: DiklyColors.textPrimary),
              ),
              const SizedBox(height: 6),
              const Text(
                'Sign in to your account',
                style: TextStyle(fontSize: 14, color: DiklyColors.textSecondary),
              ),
              const SizedBox(height: 36),
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: DiklyColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: DiklyColors.border),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 16, offset: const Offset(0, 4))],
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          prefixIcon: Icon(Icons.email_outlined, size: 20),
                        ),
                        validator: (v) => v == null || !v.contains('@') ? 'Enter a valid email' : null,
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _passCtrl,
                        obscureText: _obscurePass,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline, size: 20),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePass ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                              size: 20,
                            ),
                            onPressed: () => setState(() => _obscurePass = !_obscurePass),
                          ),
                        ),
                        validator: (v) => v == null || v.isEmpty ? 'Enter your password' : null,
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: auth.isLoading ? null : _submit,
                          style: ElevatedButton.styleFrom(backgroundColor: color),
                          child: auth.isLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Text('Sign In'),
                        ),
                      ),
                    ],
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
