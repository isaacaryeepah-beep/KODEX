import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme.dart';

class PortalSelectScreen extends StatefulWidget {
  const PortalSelectScreen({super.key});

  @override
  State<PortalSelectScreen> createState() => _PortalSelectScreenState();
}

class _PortalSelectScreenState extends State<PortalSelectScreen> {
  String? _mode;

  static const _corpRoles = [
    _Role('admin',    'Admin',    'Manage company settings & users',  Icons.manage_accounts_outlined,     Color(0xFF6366F1)),
    _Role('manager',  'Manager',  'Team leads & department managers', Icons.business_center_outlined,     Color(0xFF0891B2)),
    _Role('employee', 'Employee', 'Staff & workers',                  Icons.badge_outlined,               Color(0xFF059669)),
  ];

  static const _acadRoles = [
    _Role('admin',    'Admin',    'Manage institution settings',      Icons.admin_panel_settings_outlined, Color(0xFF6366F1)),
    _Role('lecturer', 'Lecturer', 'Manage courses & attendance',      Icons.cast_for_education_outlined,   Color(0xFF7C3AED)),
    _Role('hod',      'HOD',      'Head of department',               Icons.work_outline,                  Color(0xFFD97706)),
    _Role('student',  'Student',  'Academic learning & attendance',   Icons.school_outlined,               DiklyColors.primary),
  ];

  void _selectRole(_Role role) {
    context.push('/login/${role.id}', extra: _mode);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Background
          Image.asset('assets/bg_office.jpg', fit: BoxFit.cover),
          Container(color: const Color(0xCC141628)),

          // Content — header pinned, card scrolls
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Pinned header ─────────────────────────────────────
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Logo row
                      Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.asset(
                              'assets/icon.png',
                              width: 40,
                              height: 40,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.business,
                                color: DiklyColors.primary,
                                size: 40,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'DIKLY',
                                style: GoogleFonts.dmSans(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  letterSpacing: 2,
                                ),
                              ),
                              Text(
                                'Innovate · Connect · Empower',
                                style: GoogleFonts.dmSans(
                                  fontSize: 10,
                                  color: Colors.white60,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Choose your portal to get started',
                        style: GoogleFonts.dmSans(
                          fontSize: 13,
                          color: Colors.white70,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // ── Scrollable card ───────────────────────────────────
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.18),
                            blurRadius: 32,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // ── Workspace selector ──
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'CHOOSE YOUR WORKSPACE',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1.6,
                                    color: const Color(0xFF9CA3AF),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    Expanded(
                                      child: _ModeCard(
                                        label: 'Corporate',
                                        sublabel: 'Businesses &\norganisations',
                                        icon: Icons.work_outline,
                                        selected: _mode == 'corp',
                                        onTap: () => setState(() => _mode = 'corp'),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: _ModeCard(
                                        label: 'Academic',
                                        sublabel: 'Schools &\ninstitutions',
                                        icon: Icons.school_outlined,
                                        selected: _mode == 'acad',
                                        onTap: () => setState(() => _mode = 'acad'),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),

                          // ── Role list ───────────────────────────────
                          if (_mode != null) ...[
                            const SizedBox(height: 20),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 20),
                              child: _SectionLabel(
                                label: _mode == 'corp' ? 'Corporate Portals' : 'Academic Portals',
                                color: _mode == 'corp'
                                    ? const Color(0xFF0891B2)
                                    : const Color(0xFF7C3AED),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                              child: GridView.count(
                                crossAxisCount: 2,
                                crossAxisSpacing: 10,
                                mainAxisSpacing: 10,
                                childAspectRatio: 1.4,
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                children: (_mode == 'corp' ? _corpRoles : _acadRoles)
                                    .map((r) => _RoleCard(
                                          role: r,
                                          onTap: () => _selectRole(r),
                                        ))
                                    .toList(),
                              ),
                            ),
                          ],

                          // ── Footer ──────────────────────────────────
                          const SizedBox(height: 20),
                          const Divider(height: 1, color: Color(0xFFF3F4F6)),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
                            child: Column(
                              children: [
                                Text(
                                  'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.dmSans(
                                    fontSize: 10,
                                    color: const Color(0xFF9CA3AF),
                                    height: 1.5,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '© 2026 DIKLY Technologies. All rights reserved.',
                                  textAlign: TextAlign.center,
                                  style: GoogleFonts.dmSans(
                                    fontSize: 10,
                                    color: const Color(0xFFD1D5DB),
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
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

class _Role {
  final String id, label, sublabel;
  final IconData icon;
  final Color color;
  const _Role(this.id, this.label, this.sublabel, this.icon, this.color);
}

class _ModeCard extends StatelessWidget {
  final String label, sublabel;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _ModeCard({
    required this.label,
    required this.sublabel,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFF7C3AED);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFF5F3FF) : const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? accent : const Color(0xFFE5E7EB),
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: selected ? accent.withOpacity(0.1) : const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: selected ? accent : const Color(0xFF9CA3AF)),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: GoogleFonts.dmSans(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? const Color(0xFF111827) : const Color(0xFF374151),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              sublabel,
              textAlign: TextAlign.center,
              style: GoogleFonts.dmSans(
                fontSize: 10,
                color: const Color(0xFF6B7280),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 6),
            Container(
              height: 3,
              width: 28,
              decoration: BoxDecoration(
                color: selected ? accent : Colors.transparent,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  final Color color;
  const _SectionLabel({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 3,
          height: 14,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: GoogleFonts.dmSans(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: color,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}

class _RoleCard extends StatelessWidget {
  final _Role role;
  final VoidCallback onTap;
  const _RoleCard({required this.role, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        decoration: BoxDecoration(
          color: const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: role.color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(role.icon, color: role.color, size: 20),
            ),
            const SizedBox(height: 10),
            Text(
              role.label,
              style: GoogleFonts.dmSans(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              role.sublabel,
              textAlign: TextAlign.center,
              style: GoogleFonts.dmSans(
                fontSize: 11,
                color: const Color(0xFF6B7280),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
