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
  String? _selectedMode; // null = nothing selected yet

  late AnimationController _fadeCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 600));
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
          // ── Office photo background
          Positioned.fill(
            child: Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),
          ),

          // ── Dark indigo overlay — kept at ~72% so background photo bleeds through the glass
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xB80F0C29), // 72%
                    Color(0xC51A1650), // 77%
                    Color(0xB80D0B2E), // 72%
                  ],
                  stops: [0.0, 0.5, 1.0],
                ),
              ),
            ),
          ),

          // ── Subtle purple glow top-right
          Positioned(
            top: -60,
            right: -60,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF6366F1).withOpacity(0.18),
              ),
            ),
          ),

          // ── Main scrollable content
          SafeArea(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: Center(
                child: SingleChildScrollView(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 22, vertical: 20),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 430),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const SizedBox(height: 4),

                        // ── Logo row
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 62,
                              height: 62,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.4),
                                    blurRadius: 20,
                                    offset: const Offset(0, 6),
                                  ),
                                ],
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(16),
                                child: Image.asset('assets/icon.png',
                                    fit: BoxFit.cover),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'DIKLY',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 38,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                    letterSpacing: 2.5,
                                    height: 1.0,
                                  ),
                                ),
                                Text(
                                  'INNOVATE · CONNECT · EMPOWER',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white.withOpacity(0.45),
                                    letterSpacing: 3.0,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),

                        const SizedBox(height: 16),

                        // ── Headline
                        Text(
                          'ENTERPRISE ATTENDANCE\nMANAGEMENT PLATFORM',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.dmSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white.withOpacity(0.80),
                            letterSpacing: 3.2,
                            height: 1.7,
                          ),
                        ),

                        const SizedBox(height: 28),

                        // ── Frosted glass workspace card
                        ClipRRect(
                          borderRadius: BorderRadius.circular(28),
                          child: BackdropFilter(
                            filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                            child: Container(
                              decoration: BoxDecoration(
                                // Gradient: lighter top-left → darker bottom-right = glass depth
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Colors.white.withOpacity(0.22),
                                    Colors.white.withOpacity(0.10),
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(28),
                                border: Border.all(
                                  color: Colors.white.withOpacity(0.40),
                                  width: 1.5,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.20),
                                    blurRadius: 40,
                                    offset: const Offset(0, 16),
                                  ),
                                  // Inner highlight at top edge
                                  BoxShadow(
                                    color: Colors.white.withOpacity(0.10),
                                    blurRadius: 0,
                                    spreadRadius: -1,
                                    offset: const Offset(0, 1),
                                  ),
                                ],
                              ),
                              padding: const EdgeInsets.fromLTRB(
                                  18, 22, 18, 22),
                              child: Column(
                                children: [
                                  // "CHOOSE YOUR WORKSPACE"
                                  Text(
                                    'CHOOSE YOUR WORKSPACE',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white.withOpacity(0.70),
                                      letterSpacing: 2.6,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    height: 1,
                                    color: Colors.white.withOpacity(0.15),
                                    margin: const EdgeInsets.symmetric(horizontal: 20),
                                  ),
                                  const SizedBox(height: 16),

                                  // ── Corporate / Academic cards
                                  Row(
                                    children: [
                                      Expanded(
                                        child: _WorkspaceCard(
                                          label: 'Corporate',
                                          subtitle:
                                              'Businesses &\norganisations',
                                          icon: Icons
                                              .business_center_rounded,
                                          iconColor:
                                              const Color(0xFFB45309),
                                          iconBg:
                                              const Color(0xFFFEF3C7),
                                          isSelected:
                                              _selectedMode == 'corp',
                                          anySelected:
                                              _selectedMode != null,
                                          onTap: () => setState(
                                              () => _selectedMode = 'corp'),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: _WorkspaceCard(
                                          label: 'Academic',
                                          subtitle:
                                              'Schools &\ninstitutions',
                                          icon: Icons.school_rounded,
                                          iconColor:
                                              const Color(0xFF4338CA),
                                          iconBg:
                                              const Color(0xFFEEF2FF),
                                          isSelected:
                                              _selectedMode == 'acad',
                                          anySelected:
                                              _selectedMode != null,
                                          onTap: () => setState(
                                              () => _selectedMode = 'acad'),
                                        ),
                                      ),
                                    ],
                                  ),

                                  // ── Portal cards — revealed when workspace picked
                                  AnimatedSize(
                                    duration:
                                        const Duration(milliseconds: 360),
                                    curve: Curves.easeInOut,
                                    child: _selectedMode == null
                                        ? const SizedBox.shrink()
                                        : Column(
                                            children: [
                                              const SizedBox(height: 16),
                                              Container(
                                                height: 1,
                                                color: Colors.white
                                                    .withOpacity(0.12),
                                              ),
                                              const SizedBox(height: 16),
                                              AnimatedSwitcher(
                                                duration: const Duration(
                                                    milliseconds: 320),
                                                transitionBuilder:
                                                    (child, anim) =>
                                                        FadeTransition(
                                                  opacity: anim,
                                                  child: SlideTransition(
                                                    position:
                                                        Tween<Offset>(
                                                      begin: const Offset(
                                                          0, 0.06),
                                                      end: Offset.zero,
                                                    ).animate(
                                                            CurvedAnimation(
                                                                parent:
                                                                    anim,
                                                                curve: Curves
                                                                    .easeOut)),
                                                    child: child,
                                                  ),
                                                ),
                                                child: _selectedMode ==
                                                        'corp'
                                                    ? _CorporateCards(
                                                        key: const ValueKey(
                                                            'corp'))
                                                    : _AcademicCards(
                                                        key: const ValueKey(
                                                            'acad')),
                                              ),
                                            ],
                                          ),
                                  ),

                                  // ── Trust indicator (always visible at bottom)
                                  const SizedBox(height: 20),
                                  Container(
                                    height: 1,
                                    color: Colors.white.withOpacity(0.10),
                                  ),
                                  const SizedBox(height: 16),
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      gradient: const LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [
                                          Color(0xFF6366F1),
                                          Color(0xFF4338CA)
                                        ],
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF6366F1)
                                              .withOpacity(0.45),
                                          blurRadius: 16,
                                          offset: const Offset(0, 4),
                                        ),
                                      ],
                                    ),
                                    child: const Icon(
                                      Icons.verified_user_rounded,
                                      color: Colors.white,
                                      size: 22,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.lock_outline_rounded,
                                        color:
                                            Colors.white.withOpacity(0.45),
                                        size: 13,
                                      ),
                                      const SizedBox(width: 5),
                                      Text(
                                        'Secure. Reliable. Scalable.',
                                        style: GoogleFonts.dmSans(
                                          fontSize: 12,
                                          color: Colors.white
                                              .withOpacity(0.50),
                                          fontWeight: FontWeight.w500,
                                          letterSpacing: 0.3,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 22),

                        // ── Footer
                        RichText(
                          textAlign: TextAlign.center,
                          text: TextSpan(
                            style: GoogleFonts.dmSans(
                              fontSize: 11.5,
                              color: Colors.white.withOpacity(0.45),
                              height: 1.6,
                            ),
                            children: [
                              const TextSpan(
                                  text: 'By using DIKLY, you agree to our '),
                              TextSpan(
                                text: 'Terms & Conditions',
                                style: GoogleFonts.dmSans(
                                  fontSize: 11.5,
                                  color: const Color(0xFF818CF8),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const TextSpan(text: ' and '),
                              TextSpan(
                                text: 'Privacy Policy',
                                style: GoogleFonts.dmSans(
                                  fontSize: 11.5,
                                  color: const Color(0xFF818CF8),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const TextSpan(text: '.'),
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '© 2026 DIKLY Technologies. All rights reserved.\nFounded by Isaac Kweku Aryeepah',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.dmSans(
                            fontSize: 11,
                            color: Colors.white.withOpacity(0.30),
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

          // ── Help pill — frosted glass
          Positioned(
            bottom: 28,
            right: 18,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                child: GestureDetector(
                  onTap: () {},
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 9),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                          color: Colors.white.withOpacity(0.20)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.help_outline_rounded,
                            color: Colors.white.withOpacity(0.8), size: 15),
                        const SizedBox(width: 5),
                        Text(
                          'Help',
                          style: GoogleFonts.dmSans(
                            fontSize: 13,
                            color: Colors.white.withOpacity(0.85),
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
  final bool anySelected;
  final VoidCallback onTap;

  const _WorkspaceCard({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.isSelected,
    required this.anySelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // Unselected-but-another-picked: lavender tint; default: bright white
    final bg = isSelected
        ? Colors.white
        : (anySelected
            ? const Color(0xFFEEF2FF).withOpacity(0.70)
            : Colors.white.withOpacity(0.95));

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 18),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isSelected
                ? iconColor.withOpacity(0.55)
                : Colors.white.withOpacity(0.3),
            width: isSelected ? 2.0 : 1.2,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: iconColor.withOpacity(0.22),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ]
              : [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.08),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: isSelected ? iconBg : iconBg.withOpacity(0.75),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 26),
            ),
            const SizedBox(height: 14),
            Text(
              label,
              style: GoogleFonts.dmSans(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: const Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: GoogleFonts.dmSans(
                fontSize: 12,
                color: const Color(0xFF6B7280),
                height: 1.45,
              ),
            ),
            const SizedBox(height: 14),
            // Animated indicator bar
            AnimatedContainer(
              duration: const Duration(milliseconds: 260),
              height: 3.5,
              width: isSelected ? 40 : 26,
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
        _SectionHeader(
          icon: Icons.business_center_rounded,
          label: 'CORPORATE PORTALS',
          iconColor: const Color(0xFFB45309),
          badgeBg: const Color(0xFFFEF3C7),
        ),
        const SizedBox(height: 10),
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
        _SectionHeader(
          icon: Icons.school_rounded,
          label: 'ACADEMIC PORTALS',
          iconColor: const Color(0xFF4338CA),
          badgeBg: const Color(0xFFEEF2FF),
        ),
        const SizedBox(height: 10),
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

// ── Section Header ─────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color iconColor;
  final Color badgeBg;

  const _SectionHeader({
    required this.icon,
    required this.label,
    required this.iconColor,
    required this.badgeBg,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: badgeBg,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, color: iconColor, size: 11),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: GoogleFonts.dmSans(
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            color: iconColor,
            letterSpacing: 1.8,
          ),
        ),
      ],
    );
  }
}

// ── Portal Card ────────────────────────────────────────────────────────────────

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
        transform: _pressed
            ? (Matrix4.identity()..scale(0.95))
            : Matrix4.identity(),
        transformAlignment: Alignment.center,
        padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 10),
        decoration: BoxDecoration(
          color: _pressed
              ? const Color(0xFFF5F5FF)
              : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: _pressed
                ? widget.iconColor.withOpacity(0.35)
                : const Color(0xFFE5E7EB),
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
              decoration: BoxDecoration(
                  color: widget.iconBg, shape: BoxShape.circle),
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
                Icon(Icons.arrow_forward_rounded,
                    size: 11, color: widget.iconColor),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
