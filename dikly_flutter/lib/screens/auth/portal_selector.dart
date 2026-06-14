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
          // ── Office photo background (matches website)
          Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),
          Container(color: const Color(0xBF0D1117)),

          // ── Main scrollable content
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const SizedBox(height: 8),

                      // ── Logo + title ──────────────────────────────────
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // DIKLY logo icon — uses the same D-logo app icon
                          ClipRRect(
                            borderRadius: BorderRadius.circular(14),
                            child: Image.asset(
                              'assets/icon.png',
                              width: 52,
                              height: 52,
                              fit: BoxFit.cover,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'DIKLY',
                                style: TextStyle(
                                  fontSize: 32,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: 2,
                                  height: 1.0,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: 14),

                      // ── Enterprise tagline ────────────────────────────
                      const Text(
                        'ENTERPRISE ATTENDANCE\nMANAGEMENT PLATFORM',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                          letterSpacing: 2.5,
                          height: 1.6,
                        ),
                      ),
                      const SizedBox(height: 10),

                      // ── Colored dots tagline ──────────────────────────
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _dot(const Color(0xFF4ADE80)),
                          const SizedBox(width: 6),
                          _tagText('INNOVATE'),
                          const SizedBox(width: 10),
                          _dot(const Color(0xFF60A5FA)),
                          const SizedBox(width: 6),
                          _tagText('CONNECT'),
                          const SizedBox(width: 10),
                          _dot(const Color(0xFFFBBF24)),
                          const SizedBox(width: 6),
                          _tagText('EMPOWER'),
                        ],
                      ),

                      const SizedBox(height: 28),

                      // ── White workspace card ──────────────────────────
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.30),
                              blurRadius: 40,
                              offset: const Offset(0, 12),
                            ),
                          ],
                        ),
                        padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // "CHOOSE YOUR WORKSPACE"
                            Center(
                              child: Text(
                                'CHOOSE YOUR WORKSPACE',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: const Color(0xFF9CA3AF),
                                  letterSpacing: 2.0,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Container(height: 1, color: const Color(0xFFF3F4F6)),
                            const SizedBox(height: 14),

                            // Corporate / Academic selector cards
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

                            const SizedBox(height: 16),

                            // Portal cards — animated switch
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 260),
                              transitionBuilder: (child, anim) => FadeTransition(
                                opacity: anim,
                                child: SlideTransition(
                                  position: Tween<Offset>(
                                    begin: const Offset(0, 0.05),
                                    end: Offset.zero,
                                  ).animate(anim),
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


                      const SizedBox(height: 20),

                      // ── Footer ────────────────────────────────────────
                      Text(
                        'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.4), height: 1.5),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '© 2026 DIKLY Technologies. All rights reserved.\nFounded by Isaac Kweku Aryeepah',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.35), height: 1.5),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Help FAB ─────────────────────────────────────────────────
          Positioned(
            bottom: 32,
            right: 16,
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
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Text('Help', style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w500)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dot(Color color) => Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
  Widget _tagText(String t) => Text(t, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: Colors.white70, letterSpacing: 1.5));
}

// ── Workspace Card ────────────────────────────────────────────────────────────

class _WorkspaceCard extends StatelessWidget {
  final String label, subtitle;
  final IconData icon;
  final Color iconColor, iconBg;
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
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? iconColor.withOpacity(0.6) : const Color(0xFFE5E7EB),
            width: isSelected ? 2 : 1,
          ),
          boxShadow: [
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
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
            ),
            const SizedBox(height: 3),
            Text(
              subtitle,
              style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280), height: 1.4),
            ),
            const SizedBox(height: 10),
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

// ── Corporate Portal Cards (3-column row matching website) ────────────────────

class _CorporateCards extends StatelessWidget {
  const _CorporateCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.work_outline_rounded, size: 11, color: const Color(0xFFB45309)),
            const SizedBox(width: 5),
            const Text(
              'CORPORATE PORTALS',
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFFB45309), letterSpacing: 2.0),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _GridPortalCard(
                icon: Icons.person_outlined,
                iconColor: const Color(0xFF2563EB),
                iconBg: const Color(0xFFEFF6FF),
                title: 'Admin',
                subtitle: 'Company admin',
                onTap: () => context.go('/login/admin', extra: 'corp'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.groups_outlined,
                iconColor: const Color(0xFF4F46E5),
                iconBg: const Color(0xFFEEF2FF),
                title: 'Manager',
                subtitle: 'Team leads & managers',
                onTap: () => context.go('/login/manager', extra: 'corp'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.badge_outlined,
                iconColor: const Color(0xFF16A34A),
                iconBg: const Color(0xFFF0FDF4),
                title: 'Employee',
                subtitle: 'Staff & workers',
                onTap: () => context.go('/login/employee', extra: 'corp'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Academic Portal Cards (2×2 grid matching website) ────────────────────────

class _AcademicCards extends StatelessWidget {
  const _AcademicCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.school_outlined, size: 11, color: const Color(0xFF4338CA)),
            const SizedBox(width: 5),
            const Text(
              'ACADEMIC PORTALS',
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF4338CA), letterSpacing: 2.0),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _GridPortalCard(
                icon: Icons.admin_panel_settings_outlined,
                iconColor: const Color(0xFF2563EB),
                iconBg: const Color(0xFFEFF6FF),
                title: 'Admin',
                subtitle: 'Institution admin',
                onTap: () => context.go('/login/admin', extra: 'acad'),
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
                onTap: () => context.go('/login/lecturer', extra: 'acad'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _GridPortalCard(
                icon: Icons.account_balance_outlined,
                iconColor: const Color(0xFF4F46E5),
                iconBg: const Color(0xFFEEF2FF),
                title: 'HOD',
                subtitle: 'Head of Department',
                onTap: () => context.go('/login/hod', extra: 'acad'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.menu_book_outlined,
                iconColor: const Color(0xFF0EA5E9),
                iconBg: const Color(0xFFE0F2FE),
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

// ── Grid Portal Card ──────────────────────────────────────────────────────────

class _GridPortalCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor, iconBg;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _GridPortalCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB), width: 1.5),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4, offset: const Offset(0, 2)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 18),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(
                subtitle!,
                style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280), height: 1.3),
                maxLines: 2,
              ),
            ],
            const SizedBox(height: 6),
            Row(
              children: [
                Text('Sign in', style: TextStyle(fontSize: 10, color: iconColor, fontWeight: FontWeight.w600)),
                const SizedBox(width: 2),
                Text('→', style: TextStyle(fontSize: 10, color: iconColor)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

