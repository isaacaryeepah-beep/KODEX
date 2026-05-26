import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme.dart';

class PortalSelectorScreen extends StatefulWidget {
  const PortalSelectorScreen({super.key});

  @override
  State<PortalSelectorScreen> createState() => _PortalSelectorScreenState();
}

class _PortalSelectorScreenState extends State<PortalSelectorScreen> {
  String _selectedMode = 'corp';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.authBg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // ── A) Logo section ────────────────────────────────────────
                  _DiklyLogo(),
                  const SizedBox(height: 8),
                  Text(
                    'Enterprise Attendance Management Platform',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.dmSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                      color: DiklyColors.textLight,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // ── B) "CHOOSE YOUR WORKSPACE" heading ─────────────────────
                  Text(
                    'CHOOSE YOUR WORKSPACE',
                    style: GoogleFonts.dmSans(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: DiklyColors.textMuted,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── C) Mode toggles ────────────────────────────────────────
                  Row(
                    children: [
                      Expanded(
                        child: _ModeToggle(
                          label: 'Corporate',
                          subtitle: 'Businesses & organisations',
                          icon: Icons.work_outline_rounded,
                          isSelected: _selectedMode == 'corp',
                          selectedBorderColor: DiklyColors.primary,
                          selectedBgColor: DiklyColors.primaryULight,
                          accentColor: DiklyColors.primary,
                          onTap: () => setState(() => _selectedMode = 'corp'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _ModeToggle(
                          label: 'Academic',
                          subtitle: 'Schools & institutions',
                          icon: Icons.school_outlined,
                          isSelected: _selectedMode == 'acad',
                          selectedBorderColor: const Color(0xFF7C3AED),
                          selectedBgColor: const Color(0xFFF5F3FF),
                          accentColor: const Color(0xFF7C3AED),
                          onTap: () => setState(() => _selectedMode = 'acad'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // ── D) Portal cards (AnimatedSwitcher) ─────────────────────
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: SlideTransition(
                        position: Tween<Offset>(
                          begin: const Offset(0, 0.08),
                          end: Offset.zero,
                        ).animate(animation),
                        child: child,
                      ),
                    ),
                    child: _selectedMode == 'corp'
                        ? _CorporateCards(key: const ValueKey('corp'))
                        : _AcademicCards(key: const ValueKey('acad')),
                  ),

                  const SizedBox(height: 32),

                  // ── Footer ─────────────────────────────────────────────────
                  Text(
                    'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.dmSans(
                      fontSize: 11,
                      color: DiklyColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '© 2026 DIKLY Technologies. All rights reserved.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.dmSans(
                      fontSize: 11,
                      color: DiklyColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── DIKLY Logo Widget ───────────────────────────────────────────────────────────

class _DiklyLogo extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
            ),
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF2563EB).withOpacity(0.25),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Center(
            child: Text(
              'D',
              style: GoogleFonts.dmSans(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                height: 1.0,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Text(
          'DIKLY',
          style: GoogleFonts.dmSans(
            fontSize: 32,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF1E1B4B),
            letterSpacing: 1,
          ),
        ),
      ],
    );
  }
}

// ── Mode Toggle Widget ─────────────────────────────────────────────────────────

class _ModeToggle extends StatelessWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final bool isSelected;
  final Color selectedBorderColor;
  final Color selectedBgColor;
  final Color accentColor;
  final VoidCallback onTap;

  const _ModeToggle({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.isSelected,
    required this.selectedBorderColor,
    required this.selectedBgColor,
    required this.accentColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? selectedBgColor : DiklyColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? selectedBorderColor : DiklyColors.border,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isSelected
                    ? accentColor.withOpacity(0.12)
                    : DiklyColors.grey100,
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 18,
                color: isSelected ? accentColor : DiklyColors.textLight,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.dmSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isSelected ? accentColor : DiklyColors.text,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.dmSans(
                      fontSize: 10,
                      color: DiklyColors.textMuted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isSelected ? accentColor : Colors.transparent,
                border: Border.all(
                  color: isSelected ? accentColor : DiklyColors.border,
                  width: 2,
                ),
              ),
              child: isSelected
                  ? const Icon(Icons.check, size: 11, color: Colors.white)
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Corporate Portal Cards ─────────────────────────────────────────────────────

class _CorporateCards extends StatelessWidget {
  const _CorporateCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _PortalCard(
          icon: Icons.admin_panel_settings_outlined,
          iconColor: const Color(0xFF2563EB),
          iconBgColor: const Color(0xFFEFF6FF),
          title: 'Admin',
          subtitle: 'Manage company settings & users',
          onTap: () => context.go('/login/admin'),
        ),
        const SizedBox(height: 10),
        _PortalCard(
          icon: Icons.business_center_outlined,
          iconColor: const Color(0xFF4F46E5),
          iconBgColor: const Color(0xFFEEF2FF),
          title: 'Manager',
          subtitle: 'Team leads & department managers',
          onTap: () => context.go('/login/manager'),
        ),
        const SizedBox(height: 10),
        _PortalCard(
          icon: Icons.badge_outlined,
          iconColor: const Color(0xFF16A34A),
          iconBgColor: const Color(0xFFF0FDF4),
          title: 'Employee',
          subtitle: 'Staff & workers',
          onTap: () => context.go('/login/employee'),
        ),
      ],
    );
  }
}

// ── Academic Portal Cards ──────────────────────────────────────────────────────

class _AcademicCards extends StatelessWidget {
  const _AcademicCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _PortalCard(
          icon: Icons.menu_book_outlined,
          iconColor: const Color(0xFF7C3AED),
          iconBgColor: const Color(0xFFF5F3FF),
          title: 'Student',
          subtitle: 'Learners & enrolled students',
          onTap: () => context.go('/login/student'),
        ),
        const SizedBox(height: 10),
        _PortalCard(
          icon: Icons.person_outlined,
          iconColor: const Color(0xFF2563EB),
          iconBgColor: const Color(0xFFEFF6FF),
          title: 'Lecturer',
          subtitle: 'Course instructors & tutors',
          onTap: () => context.go('/login/lecturer'),
        ),
        const SizedBox(height: 10),
        _PortalCard(
          icon: Icons.account_balance_outlined,
          iconColor: const Color(0xFF4F46E5),
          iconBgColor: const Color(0xFFEEF2FF),
          title: 'HOD',
          subtitle: 'Head of Department',
          onTap: () => context.go('/login/hod'),
        ),
      ],
    );
  }
}

// ── Portal Card Widget ─────────────────────────────────────────────────────────

class _PortalCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBgColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _PortalCard({
    required this.icon,
    required this.iconColor,
    required this.iconBgColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: DiklyColors.border, width: 1.5),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: iconBgColor,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.dmSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.text,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: GoogleFonts.dmSans(
                      fontSize: 12,
                      color: DiklyColors.textLight,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              '→',
              style: GoogleFonts.dmSans(
                fontSize: 18,
                color: DiklyColors.textMuted,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
