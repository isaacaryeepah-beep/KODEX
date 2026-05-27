import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Background photo ─────────────────────────────────────────────
          Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),

          // ── Dark indigo overlay (~70% opacity, matching website) ─────────
          Container(
            color: const Color(0xFF1E1B4B).withOpacity(0.72),
          ),

          // ── Main scrollable content ──────────────────────────────────────
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(height: 12),

                  // ── Logo ─────────────────────────────────────────────────
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Image.asset('assets/icon.png', width: 52, height: 52),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'DIKLY',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: 1.5,
                              height: 1.0,
                            ),
                          ),
                          Text(
                            'INNOVATE · CONNECT · EMPOWER',
                            style: TextStyle(
                              fontSize: 8.5,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withOpacity(0.6),
                              letterSpacing: 2.2,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  // ── Hero headline ─────────────────────────────────────────
                  const Text(
                    'ENTERPRISE ATTENDANCE\nMANAGEMENT PLATFORM',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: 2.5,
                      height: 1.55,
                    ),
                  ),

                  const SizedBox(height: 28),

                  // ── Workspace card ────────────────────────────────────────
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.35),
                          blurRadius: 40,
                          offset: const Offset(0, 16),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 22),
                    child: Column(
                      children: [
                        const Text(
                          'CHOOSE YOUR WORKSPACE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF6B7280),
                            letterSpacing: 2.2,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          height: 1,
                          color: const Color(0xFFE5E7EB),
                          margin: const EdgeInsets.symmetric(horizontal: 16),
                        ),
                        const SizedBox(height: 14),

                        // Corporate / Academic toggle
                        Row(
                          children: [
                            Expanded(
                              child: _WorkspaceCard(
                                label: 'Corporate',
                                subtitle: 'Businesses &\norganisations',
                                icon: Icons.work_outline_rounded,
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
                                icon: Icons.school_outlined,
                                iconColor: const Color(0xFF4338CA),
                                iconBg: const Color(0xFFEEF2FF),
                                isSelected: _selectedMode == 'acad',
                                onTap: () => setState(() => _selectedMode = 'acad'),
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(height: 14),

                        // Animated role section
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 260),
                          transitionBuilder: (child, animation) => FadeTransition(
                            opacity: animation,
                            child: SlideTransition(
                              position: Tween<Offset>(
                                begin: const Offset(0, 0.05),
                                end: Offset.zero,
                              ).animate(animation),
                              child: child,
                            ),
                          ),
                          child: _selectedMode == 'corp'
                              ? _CorporateSection(key: const ValueKey('corp'))
                              : _AcademicSection(key: const ValueKey('acad')),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // ── Footer ────────────────────────────────────────────────
                  Text(
                    'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.white.withOpacity(0.5),
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '© 2026 DIKLY Technologies. All rights reserved.\nFounded by Isaac Kweku Aryeepah',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.white.withOpacity(0.4),
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 80),
                ],
              ),
            ),
          ),

          // ── Help FAB ──────────────────────────────────────────────────────
          Positioned(
            bottom: 32,
            right: 20,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FloatingActionButton(
                  mini: true,
                  onPressed: () {},
                  backgroundColor: const Color(0xFF4F46E5),
                  elevation: 4,
                  child: const Icon(Icons.help_outline, color: Colors.white, size: 20),
                ),
                const SizedBox(height: 5),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white.withOpacity(0.25)),
                  ),
                  child: const Text(
                    'Help',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Workspace toggle card ─────────────────────────────────────────────────────

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
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? iconColor.withOpacity(0.55) : Colors.transparent,
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(height: 12),
            Text(
              label,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 11.5,
                color: Color(0xFF6B7280),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              height: 3,
              width: 28,
              decoration: BoxDecoration(
                color: isSelected ? iconColor : const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Corporate section — vertical list ────────────────────────────────────────

class _CorporateSection extends StatelessWidget {
  const _CorporateSection({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _PortalCard(
          icon: Icons.admin_panel_settings_outlined,
          iconColor: const Color(0xFF2563EB),
          iconBg: const Color(0xFFEFF6FF),
          title: 'Admin',
          subtitle: 'Manage company settings & users',
          onTap: () => context.go('/login/admin'),
        ),
        const SizedBox(height: 8),
        _PortalCard(
          icon: Icons.business_center_outlined,
          iconColor: const Color(0xFF4F46E5),
          iconBg: const Color(0xFFEEF2FF),
          title: 'Manager',
          subtitle: 'Team leads & department managers',
          onTap: () => context.go('/login/manager'),
        ),
        const SizedBox(height: 8),
        _PortalCard(
          icon: Icons.badge_outlined,
          iconColor: const Color(0xFF16A34A),
          iconBg: const Color(0xFFF0FDF4),
          title: 'Employee',
          subtitle: 'Staff & workers',
          onTap: () => context.go('/login/employee'),
        ),
      ],
    );
  }
}

// ── Academic section — header + 2×2 grid ─────────────────────────────────────

class _AcademicSection extends StatelessWidget {
  const _AcademicSection({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            Icon(Icons.school_outlined, size: 14, color: Color(0xFF4338CA)),
            SizedBox(width: 6),
            Text(
              'ACADEMIC PORTALS',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: Color(0xFF4338CA),
                letterSpacing: 1.8,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Row 1: Admin + Lecturer
        Row(
          children: [
            Expanded(
              child: _GridPortalCard(
                icon: Icons.admin_panel_settings_outlined,
                iconColor: const Color(0xFF2563EB),
                iconBg: const Color(0xFFEFF6FF),
                title: 'Admin',
                subtitle: 'Institution admin',
                onTap: () => context.go('/login/admin'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.person_outlined,
                iconColor: const Color(0xFF7C3AED),
                iconBg: const Color(0xFFF5F3FF),
                title: 'Lecturer',
                subtitle: 'Instructors',
                onTap: () => context.go('/login/lecturer'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Row 2: HOD + Student
        Row(
          children: [
            Expanded(
              child: _GridPortalCard(
                icon: Icons.account_balance_outlined,
                iconColor: const Color(0xFF4338CA),
                iconBg: const Color(0xFFEEF2FF),
                title: 'HOD',
                subtitle: 'Head of Department',
                onTap: () => context.go('/login/hod'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.menu_book_outlined,
                iconColor: const Color(0xFF0369A1),
                iconBg: const Color(0xFFE0F2FE),
                title: 'Student',
                subtitle: 'Learners',
                onTap: () => context.go('/login/student'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Horizontal portal card (Corporate list) ───────────────────────────────────

class _PortalCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _PortalCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 21),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF111827),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 11.5, color: Color(0xFF6B7280)),
                  ),
                ],
              ),
            ),
            const Text('→', style: TextStyle(fontSize: 17, color: Color(0xFF9CA3AF))),
          ],
        ),
      ),
    );
  }
}

// ── Square grid card (Academic 2×2) ──────────────────────────────────────────

class _GridPortalCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _GridPortalCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 16, 14, 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 8),
            const Align(
              alignment: Alignment.centerRight,
              child: Text('→', style: TextStyle(fontSize: 15, color: Color(0xFF9CA3AF))),
            ),
          ],
        ),
      ),
    );
  }
}
