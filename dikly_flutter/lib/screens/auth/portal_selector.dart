import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class PortalSelectorScreen extends StatefulWidget {
  const PortalSelectorScreen({super.key});

  @override
  State<PortalSelectorScreen> createState() => _PortalSelectorScreenState();
}

class _PortalSelectorScreenState extends State<PortalSelectorScreen> {
  String _mode = 'corp';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── Background photo ──────────────────────────────────────
          Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),
          Container(color: const Color(0xCC0D1117)),

          // ── Main scrollable content ───────────────────────────────
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
              child: Column(
                children: [
                  // ── Logo row ──────────────────────────────────────
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.asset(
                          'assets/icon.png',
                          width: 64,
                          height: 64,
                          fit: BoxFit.cover,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Text(
                        'DIKLY',
                        style: GoogleFonts.dmSans(
                          fontSize: 40,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 2,
                          height: 1,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // ── Tagline ───────────────────────────────────────
                  Text(
                    'ENTERPRISE ATTENDANCE MANAGEMENT PLATFORM',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.dmSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                      letterSpacing: 2,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 10),

                  // ── Dots tagline ──────────────────────────────────
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _dot(const Color(0xFF60A5FA)),
                      const SizedBox(width: 6),
                      _dotLabel('INNOVATE'),
                      const SizedBox(width: 8),
                      const Text('·', style: TextStyle(color: Colors.white38, fontSize: 12)),
                      const SizedBox(width: 8),
                      _dot(const Color(0xFF60A5FA)),
                      const SizedBox(width: 6),
                      _dotLabel('CONNECT'),
                      const SizedBox(width: 8),
                      const Text('·', style: TextStyle(color: Colors.white38, fontSize: 12)),
                      const SizedBox(width: 8),
                      _dot(const Color(0xFF34D399)),
                      const SizedBox(width: 6),
                      _dotLabel('EMPOWER'),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // ── Main card ─────────────────────────────────────
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF2EFE9),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    clipBehavior: Clip.hardEdge,
                    child: Column(
                      children: [
                        // Gradient top bar
                        Container(
                          height: 5,
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              colors: [Color(0xFF06B6D4), Color(0xFF3B82F6)],
                            ),
                          ),
                        ),

                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 18, 16, 22),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // CHOOSE YOUR WORKSPACE
                              Center(
                                child: Text(
                                  'CHOOSE YOUR WORKSPACE',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: const Color(0xFF9CA3AF),
                                    letterSpacing: 2.5,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Container(height: 1, color: const Color(0xFFE5E2DC)),
                              const SizedBox(height: 16),

                              // ── Workspace cards ──────────────────
                              Row(
                                children: [
                                  Expanded(
                                    child: _WorkspaceCard(
                                      label: 'Corporate',
                                      subtitle: 'Businesses &\norganisations',
                                      icon: Icons.work_outline_rounded,
                                      iconColor: const Color(0xFFD97706),
                                      iconBg: const Color(0xFFFDE68A),
                                      accentColor: const Color(0xFFD97706),
                                      isSelected: _mode == 'corp',
                                      onTap: () => setState(() => _mode = 'corp'),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: _WorkspaceCard(
                                      label: 'Academic',
                                      subtitle: 'Schools &\ninstitutions',
                                      icon: Icons.school_outlined,
                                      iconColor: const Color(0xFF4338CA),
                                      iconBg: const Color(0xFFE0E7FF),
                                      accentColor: const Color(0xFF4338CA),
                                      isSelected: _mode == 'acad',
                                      onTap: () => setState(() => _mode = 'acad'),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 22),

                              // ── Role cards (animated switch) ──────
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 250),
                                transitionBuilder: (child, anim) => FadeTransition(
                                  opacity: anim,
                                  child: SlideTransition(
                                    position: Tween<Offset>(
                                      begin: const Offset(0, 0.04),
                                      end: Offset.zero,
                                    ).animate(anim),
                                    child: child,
                                  ),
                                ),
                                child: _mode == 'corp'
                                    ? _CorporatePortals(key: const ValueKey('corp'))
                                    : _AcademicPortals(key: const ValueKey('acad')),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // ── Footer ────────────────────────────────────────
                  Text(
                    'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.4), height: 1.6),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '© 2026 DIKLY Technologies. Founded by Isaac Kweku Aryeepah',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.3), height: 1.5),
                  ),
                ],
              ),
            ),
          ),

          // ── Help FAB ──────────────────────────────────────────────
          Positioned(
            top: 48,
            right: 16,
            child: Column(
              children: [
                GestureDetector(
                  onTap: () {},
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      color: Color(0xFF4F46E5),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.help_outline, color: Colors.white, size: 22),
                  ),
                ),
                const SizedBox(height: 4),
                const Text('Help', style: TextStyle(fontSize: 10, color: Colors.white70)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dot(Color c) => Container(
        width: 8, height: 8,
        decoration: BoxDecoration(color: c, shape: BoxShape.circle));

  Widget _dotLabel(String t) => Text(t,
      style: GoogleFonts.dmSans(
          fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white70, letterSpacing: 1.5));
}

// ── Workspace Card ────────────────────────────────────────────────────────────

class _WorkspaceCard extends StatelessWidget {
  final String label, subtitle;
  final IconData icon;
  final Color iconColor, iconBg, accentColor;
  final bool isSelected;
  final VoidCallback onTap;

  const _WorkspaceCard({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.accentColor,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
        decoration: BoxDecoration(
          color: const Color(0xFFF9F8F5),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? accentColor : Colors.transparent,
            width: 2,
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 6, offset: const Offset(0, 2)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 26),
            ),
            const SizedBox(height: 14),
            Text(label,
                style: GoogleFonts.dmSans(
                    fontSize: 17, fontWeight: FontWeight.w800, color: const Color(0xFF1E293B))),
            const SizedBox(height: 4),
            Text(subtitle,
                style: GoogleFonts.dmSans(
                    fontSize: 12, color: const Color(0xFF64748B), height: 1.4)),
            const SizedBox(height: 14),
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              height: 4,
              width: 32,
              decoration: BoxDecoration(
                color: isSelected ? accentColor : const Color(0xFFD1D5DB),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Corporate Portals ─────────────────────────────────────────────────────────

class _CorporatePortals extends StatelessWidget {
  const _CorporatePortals({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section label
        Row(
          children: [
            const Icon(Icons.work_outline_rounded, size: 14, color: Color(0xFFD97706)),
            const SizedBox(width: 6),
            Text(
              'CORPORATE PORTALS',
              style: GoogleFonts.dmSans(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFFD97706),
                  letterSpacing: 2),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _RoleCard(
                icon: Icons.person_outline_rounded,
                title: 'Admin',
                subtitle: 'Company admin',
                onTap: () => context.go('/login/admin', extra: 'corp'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _RoleCard(
                icon: Icons.groups_outlined,
                title: 'Manager',
                subtitle: 'Team leads &\nmanagers',
                onTap: () => context.go('/login/manager', extra: 'corp'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _RoleCard(
                icon: Icons.badge_outlined,
                title: 'Employee',
                subtitle: 'Staff &\nworkers',
                onTap: () => context.go('/login/employee', extra: 'corp'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Academic Portals ──────────────────────────────────────────────────────────

class _AcademicPortals extends StatelessWidget {
  const _AcademicPortals({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section label
        Row(
          children: [
            const Icon(Icons.school_outlined, size: 14, color: Color(0xFF4338CA)),
            const SizedBox(width: 6),
            Text(
              'ACADEMIC PORTALS',
              style: GoogleFonts.dmSans(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF4338CA),
                  letterSpacing: 2),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _RoleCard(
                icon: Icons.person_outline_rounded,
                title: 'Admin',
                subtitle: 'Institution\nadmin',
                onTap: () => context.go('/login/admin', extra: 'acad'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _RoleCard(
                icon: Icons.groups_outlined,
                title: 'Lecturer',
                subtitle: 'Instructors',
                onTap: () => context.go('/login/lecturer', extra: 'acad'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _RoleCard(
                icon: Icons.cases_outlined,
                title: 'HOD',
                subtitle: 'Head of\nDepartment',
                onTap: () => context.go('/login/hod', extra: 'acad'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _RoleCard(
                icon: Icons.auto_stories_outlined,
                title: 'Student',
                subtitle: 'Learners',
                onTap: () => context.go('/login/student', extra: 'acad'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Role Card ─────────────────────────────────────────────────────────────────

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 18, 10, 14),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F0F8),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(
                color: Color(0xFFE0E0F0),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: const Color(0xFF4338CA), size: 22),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: GoogleFonts.dmSans(
                  fontSize: 13, fontWeight: FontWeight.w800, color: const Color(0xFF1E293B)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: GoogleFonts.dmSans(fontSize: 10, color: const Color(0xFF64748B), height: 1.4),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text('→', style: TextStyle(fontSize: 14, color: Color(0xFF94A3B8))),
          ],
        ),
      ),
    );
  }
}
