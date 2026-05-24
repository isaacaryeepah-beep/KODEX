import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';

class PortalConfig {
  final String role;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final String loginRole;
  final String portalMode;

  const PortalConfig({
    required this.role,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.loginRole,
    required this.portalMode,
  });
}

const _portals = [
  PortalConfig(
    role: 'student',
    title: 'Student',
    subtitle: 'Access courses, sessions & assignments',
    icon: Icons.school_rounded,
    color: Color(0xFF2563EB),
    loginRole: 'student',
    portalMode: 'academic',
  ),
  PortalConfig(
    role: 'lecturer',
    title: 'Lecturer',
    subtitle: 'Manage courses, attendance & grades',
    icon: Icons.person_rounded,
    color: Color(0xFF7C3AED),
    loginRole: 'lecturer',
    portalMode: 'academic',
  ),
  PortalConfig(
    role: 'manager',
    title: 'Manager',
    subtitle: 'Team management & corporate tools',
    icon: Icons.business_center_rounded,
    color: Color(0xFF0D9488),
    loginRole: 'manager',
    portalMode: 'corporate',
  ),
  PortalConfig(
    role: 'hod',
    title: 'Head of Dept',
    subtitle: 'Department oversight & analytics',
    icon: Icons.account_balance_rounded,
    color: Color(0xFFDC2626),
    loginRole: 'hod',
    portalMode: 'academic',
  ),
  PortalConfig(
    role: 'admin',
    title: 'Admin',
    subtitle: 'Full platform administration',
    icon: Icons.admin_panel_settings_rounded,
    color: Color(0xFFD97706),
    loginRole: 'admin',
    portalMode: 'academic',
  ),
];

class PortalSelectorScreen extends StatelessWidget {
  const PortalSelectorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),
              // Logo / Brand
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: DiklyColors.primary,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: DiklyColors.primary.withOpacity(0.3),
                            blurRadius: 20,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.school_rounded,
                        color: Colors.white,
                        size: 40,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'DIKLY',
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: DiklyColors.primary,
                            letterSpacing: 2,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Academic & Corporate Management',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: DiklyColors.textSecondary,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              Text(
                'Select Your Portal',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.textPrimary,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                'Choose the portal that matches your role',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: DiklyColors.textSecondary,
                    ),
              ),
              const SizedBox(height: 24),
              // Portal cards
              for (final portal in _portals) ...[
                _PortalCard(
                  portal: portal,
                  onTap: () => context.push('/login/${portal.role}'),
                ),
                const SizedBox(height: 12),
              ],
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _PortalCard extends StatelessWidget {
  final PortalConfig portal;
  final VoidCallback onTap;

  const _PortalCard({required this.portal, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: DiklyColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: portal.color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(portal.icon, color: portal.color, size: 26),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    portal.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textPrimary,
                        ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    portal.subtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: DiklyColors.textSecondary,
                        ),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios_rounded, size: 14, color: portal.color),
          ],
        ),
      ),
    );
  }
}
