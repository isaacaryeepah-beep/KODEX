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
        children: [
          // ── Background gradient (mimics the website's dark indigo photo overlay)
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF312E81),
                  Color(0xFF1E1B4B),
                  Color(0xFF0F0E2E),
                ],
                stops: [0.0, 0.55, 1.0],
              ),
            ),
          ),
          // ── Subtle texture overlay
          Container(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.topRight,
                radius: 1.5,
                colors: [
                  const Color(0xFF4F46E5).withOpacity(0.25),
                  Colors.transparent,
                ],
              ),
            ),
          ),

          // ── Main content
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      const SizedBox(height: 16),

                      // ── Logo
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset('assets/icon.png', width: 56, height: 56),
                          const SizedBox(width: 14),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'DIKLY',
                                style: TextStyle(
                                  fontSize: 34,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: 1.5,
                                  height: 1.0,
                                ),
                              ),
                              Text(
                                'INNOVATE · CONNECT · EMPOWER',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white.withOpacity(0.55),
                                  letterSpacing: 2.5,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      Text(
                        'ATTENDANCE & WORKFORCE\nMANAGEMENT PLATFORM',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withOpacity(0.9),
                          letterSpacing: 2.5,
                          height: 1.55,
                        ),
                      ),

                      const SizedBox(height: 36),

                      // ── Workspace card
                      Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3F4F6),
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.30),
                              blurRadius: 32,
                              offset: const Offset(0, 12),
                            ),
                          ],
                        ),
                        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                        child: Column(
                          children: [
                            Text(
                              'CHOOSE YOUR WORKSPACE',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: const Color(0xFF6B7280),
                                letterSpacing: 2.2,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Container(
                              height: 1,
                              color: const Color(0xFFE5E7EB),
                              margin: const EdgeInsets.symmetric(horizontal: 16),
                            ),
                            const SizedBox(height: 16),

                            Row(
                              children: [
                                Expanded(
                                  child: _WorkspaceCard(
                                    label: 'Workforce',
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

                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 280),
                              transitionBuilder: (child, animation) => FadeTransition(
                                opacity: animation,
                                child: SlideTransition(
                                  position: Tween<Offset>(
                                    begin: const Offset(0, 0.06),
                                    end: Offset.zero,
                                  ).animate(animation),
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

                      const SizedBox(height: 28),

                      Text(
                        'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withOpacity(0.45),
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '© 2026 DIKLY Technologies. All rights reserved.\nFounded by Isaac Kweku Aryeepah',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withOpacity(0.4),
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
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
        padding: const EdgeInsets.fromLTRB(14, 20, 14, 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? iconColor.withOpacity(0.5) : Colors.transparent,
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.07),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(height: 14),
            Text(
              label,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
            ),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.4)),
            const SizedBox(height: 14),
            Container(
              height: 3,
              width: 32,
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

class _CorporateCards extends StatelessWidget {
  const _CorporateCards({super.key});

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

class _AcademicCards extends StatelessWidget {
  const _AcademicCards({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'ACADEMIC PORTALS',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 2.0),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: _GridPortalCard(
                icon: Icons.admin_panel_settings_outlined,
                iconColor: const Color(0xFFDC2626),
                iconBg: const Color(0xFFFEE2E2),
                title: 'Admin',
                onTap: () => context.go('/login/admin'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.person_outlined,
                iconColor: const Color(0xFFD97706),
                iconBg: const Color(0xFFFEF3C7),
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
              child: _GridPortalCard(
                icon: Icons.account_balance_outlined,
                iconColor: const Color(0xFF0891B2),
                iconBg: const Color(0xFFE0F2FE),
                title: 'HOD',
                onTap: () => context.go('/login/hod'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _GridPortalCard(
                icon: Icons.menu_book_outlined,
                iconColor: const Color(0xFF7C3AED),
                iconBg: const Color(0xFFF5F3FF),
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

class _GridPortalCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final VoidCallback onTap;

  const _GridPortalCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB), width: 1.5),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2)),
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
            Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
            const SizedBox(height: 4),
            Row(
              children: [
                Text('Sign in', style: TextStyle(fontSize: 11, color: iconColor, fontWeight: FontWeight.w600)),
                const SizedBox(width: 2),
                Text('→', style: TextStyle(fontSize: 11, color: iconColor)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB), width: 1.5),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                ],
              ),
            ),
            const Text('→', style: TextStyle(fontSize: 18, color: Color(0xFF9CA3AF))),
          ],
        ),
      ),
    );
  }
}
