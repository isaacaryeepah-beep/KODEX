import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class PortalSelectorScreen extends StatefulWidget {
  const PortalSelectorScreen({super.key});

  @override
  State<PortalSelectorScreen> createState() => _PortalSelectorScreenState();
}

class _PortalSelectorScreenState extends State<PortalSelectorScreen>
    with SingleTickerProviderStateMixin {
  String _selectedMode = 'corp';
  late AnimationController _fadeCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _fadeCtrl.forward();
  }

  @override
  void dispose() {
    _fadeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // ── Background office photo
          Positioned.fill(
            child: Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),
          ),
          // ── Dark indigo overlay
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xCC1E1B4B),
                    Color(0xE61E1B4B),
                  ],
                ),
              ),
            ),
          ),

          // ── Main content
          SafeArea(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const SizedBox(height: 8),

                        // ── Logo
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 58,
                              height: 58,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.3),
                                    blurRadius: 16,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(14),
                                child: Image.asset('assets/icon.png', fit: BoxFit.cover),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'DIKLY',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 36,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                    letterSpacing: 2,
                                    height: 1.0,
                                  ),
                                ),
                                Text(
                                  'INNOVATE · CONNECT · EMPOWER',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 8.5,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white.withOpacity(0.5),
                                    letterSpacing: 2.8,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),

                        const SizedBox(height: 18),

                        // ── Hero headline
                        Text(
                          'ENTERPRISE ATTENDANCE\nMANAGEMENT PLATFORM',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.dmSans(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: Colors.white.withOpacity(0.85),
                            letterSpacing: 3.0,
                            height: 1.6,
                          ),
                        ),

                        const SizedBox(height: 32),

                        // ── Frosted glass workspace card
                        ClipRRect(
                          borderRadius: BorderRadius.circular(24),
                          child: BackdropFilter(
                            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.93),
                                borderRadius: BorderRadius.circular(24),
                                border: Border.all(
                                  color: Colors.white.withOpacity(0.6),
                                  width: 1.5,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.28),
                                    blurRadius: 48,
                                    offset: const Offset(0, 16),
                                  ),
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.10),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              padding: const EdgeInsets.fromLTRB(16, 20, 16, 22),
                              child: Column(
                                children: [
                                  // Header
                                  Text(
                                    'CHOOSE YOUR WORKSPACE',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: const Color(0xFF6B7280),
                                      letterSpacing: 2.4,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    height: 1,
                                    color: const Color(0xFFE5E7EB),
                                    margin: const EdgeInsets.symmetric(horizontal: 12),
                                  ),
                                  const SizedBox(height: 14),

                                  // ── Corporate / Academic selector cards
                                  Row(
                                    children: [
                                      Expanded(
                                        child: _WorkspaceCard(
                                          label: 'Corporate',
                                          subtitle: 'Businesses &\norganisations',
                                          icon: Icons.business_center_rounded,
                                          iconColor: const Color(0xFFB45309),
                                          iconBg: const Color(0xFFFEF3C7),
                                          isSelected: _selectedMode == 'corp',
                                          onTap: () => setState(() => _selectedMode = 'corp'),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: _WorkspaceCard(
                                          label: 'Academic',
                                          subtitle: 'Schools &\ninstitutions',
                                          icon: Icons.school_rounded,
                                          iconColor: const Color(0xFF4338CA),
                                          iconBg: const Color(0xFFEEF2FF),
                                          isSelected: _selectedMode == 'acad',
                                          onTap: () => setState(() => _selectedMode = 'acad'),
                                        ),
                                      ),
                                    ],
                                  ),

                                  const SizedBox(height: 14),

                                  // ── Role portal cards (animated switch)
                                  AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 300),
                                    transitionBuilder: (child, anim) => FadeTransition(
                                      opacity: anim,
                                      child: SlideTransition(
                                        position: Tween<Offset>(
                                          begin: const Offset(0, 0.05),
                                          end: Offset.zero,
                                        ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
                                        child: child,
                                      ),
                                    ),
                                    child: _selectedMode == 'corp'
                                        ? _CorporateCards(key: const ValueKey('corp'))
                                        : _AcademicCards(key: const ValueKey('acad')),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 24),

                        // ── Footer
                        Text(
                          'By using DIKLY, you agree to our Terms & Conditions\nand Privacy Policy.',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.dmSans(
                            fontSize: 11,
                            color: Colors.white.withOpacity(0.4),
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '© 2026 DIKLY Technologies. All rights reserved.\nFounded by Isaac Kweku Aryeepah',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.dmSans(
                            fontSize: 11,
                            color: Colors.white.withOpacity(0.35),
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ── Help pill button
          Positioned(
            bottom: 28,
            right: 18,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: GestureDetector(
                  onTap: () {},
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: Colors.white.withOpacity(0.25)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.help_outline_rounded, color: Colors.white, size: 15),
                        const SizedBox(width: 5),
                        Text(
                          'Help',
                          style: GoogleFonts.dmSans(
                            fontSize: 13,
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Workspace Selector Card ────────────────────────────────────────────────────

class _WorkspaceCard extends StatelessWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final bool isSelected;
  final VoidCallback onTap;

  const _WorkspaceCard({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? iconColor.withOpacity(0.45) : const Color(0xFFE5E7EB),
            width: isSelected ? 2 : 1.5,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: iconColor.withOpacity(0.15),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                  BoxShadow(
                    color: Colors.black.withOpacity(0.06),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ]
              : [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon circle
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: isSelected ? iconBg : iconBg.withOpacity(0.7),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 23),
            ),
            const SizedBox(height: 12),
            Text(
              label,
              style: GoogleFonts.dmSans(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: const Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: GoogleFonts.dmSans(
                fontSize: 11.5,
                color: const Color(0xFF6B7280),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            // Indicator bar
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              height: 3,
              width: isSelected ? 36 : 24,
              decoration: BoxDecoration(
                color: isSelected ? iconColor : const Color(0xFFD1D5DB),
                borderRadius: BorderRadius.circular(2),
              ),
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
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(Icons.business_center_rounded, color: Color(0xFFB45309), size: 11),
              ),
              const SizedBox(width: 6),
              Text(
                'CORPORATE PORTALS',
                style: GoogleFonts.dmSans(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFFB45309),
                  letterSpacing: 1.8,
                ),
              ),
            ],
          ),
        ),
        Row(
          children: [
            Expanded(
              child: _PortalCard(
                icon: Icons.person_outline_rounded,
                iconColor: const Color(0xFF4F46E5),
                iconBg: const Color(0xFFEEF2FF),
                title: 'Admin',
                subtitle: 'Company\nadmin',
                onTap: () => context.go('/login/admin'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PortalCard(
                icon: Icons.group_outlined,
                iconColor: const Color(0xFF0891B2),
                iconBg: const Color(0xFFE0F9FF),
                title: 'Manager',
                subtitle: 'Team leads\n& managers',
                onTap: () => context.go('/login/manager'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PortalCard(
                icon: Icons.badge_outlined,
                iconColor: const Color(0xFF16A34A),
                iconBg: const Color(0xFFDCFCE7),
                title: 'Employee',
                subtitle: 'Staff &\nworkers',
                onTap: () => context.go('/login/employee'),
              ),
            ),
          ],
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
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(Icons.school_rounded, color: Color(0xFF4338CA), size: 11),
              ),
              const SizedBox(width: 6),
              Text(
                'ACADEMIC PORTALS',
                style: GoogleFonts.dmSans(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF4338CA),
                  letterSpacing: 1.8,
                ),
              ),
            ],
          ),
        ),
        Row(
          children: [
            Expanded(
              child: _PortalCard(
                icon: Icons.admin_panel_settings_outlined,
                iconColor: const Color(0xFFDC2626),
                iconBg: const Color(0xFFFEE2E2),
                title: 'Admin',
                onTap: () => context.go('/login/admin'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PortalCard(
                icon: Icons.cast_for_education_outlined,
                iconColor: const Color(0xFF7C3AED),
                iconBg: const Color(0xFFF5F3FF),
                title: 'Lecturer',
                onTap: () => context.go('/login/lecturer'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _PortalCard(
                icon: Icons.account_balance_outlined,
                iconColor: const Color(0xFF4F46E5),
                iconBg: const Color(0xFFEEF2FF),
                title: 'HOD',
                onTap: () => context.go('/login/hod'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _PortalCard(
                icon: Icons.menu_book_outlined,
                iconColor: const Color(0xFF0EA5E9),
                iconBg: const Color(0xFFE0F2FE),
                title: 'Student',
                onTap: () => context.go('/login/student'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Portal Card (role entry point) ────────────────────────────────────────────

class _PortalCard extends StatefulWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _PortalCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  @override
  State<_PortalCard> createState() => _PortalCardState();
}

class _PortalCardState extends State<_PortalCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) {
        setState(() => _pressed = false);
        widget.onTap();
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        transform: _pressed ? (Matrix4.identity()..scale(0.96)) : Matrix4.identity(),
        padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 10),
        decoration: BoxDecoration(
          color: _pressed ? const Color(0xFFF5F5FF) : Colors.white,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(
            color: _pressed ? widget.iconColor.withOpacity(0.3) : const Color(0xFFE5E7EB),
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(_pressed ? 0.02 : 0.05),
              blurRadius: _pressed ? 2 : 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: widget.iconBg, shape: BoxShape.circle),
              child: Icon(widget.icon, color: widget.iconColor, size: 19),
            ),
            const SizedBox(height: 9),
            Text(
              widget.title,
              style: GoogleFonts.dmSans(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF111827),
              ),
            ),
            if (widget.subtitle != null) ...[
              const SizedBox(height: 2),
              Text(
                widget.subtitle!,
                style: GoogleFonts.dmSans(
                  fontSize: 9.5,
                  color: const Color(0xFF6B7280),
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 4),
            ] else
              const SizedBox(height: 6),
            Row(
              children: [
                Text(
                  'Sign in',
                  style: GoogleFonts.dmSans(
                    fontSize: 10.5,
                    color: widget.iconColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 2),
                Icon(Icons.arrow_forward_rounded, size: 11, color: widget.iconColor),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
