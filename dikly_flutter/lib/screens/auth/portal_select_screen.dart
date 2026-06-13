import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';

class PortalSelectScreen extends StatefulWidget {
  const PortalSelectScreen({super.key});

  @override
  State<PortalSelectScreen> createState() => _PortalSelectScreenState();
}

class _PortalSelectScreenState extends State<PortalSelectScreen> {
  // null = nothing selected yet, 'corp' or 'acad'
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

  void _selectMode(String mode) {
    setState(() => _mode = mode);
  }

  void _selectRole(_Role role) {
    // Pass portalMode as extra so login screen can use it
    context.push('/login/${role.id}', extra: _mode);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Background photo
          Image.asset('assets/login-bg.jpg', fit: BoxFit.cover),
          // Dark overlay matching web app: rgba(20,22,40,0.50)
          Container(color: const Color(0x80141628)),
          // Content
          SafeArea(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: Column(
              children: [
                // Logo + brand
                _buildBrand(),
                const SizedBox(height: 8),
                const Text(
                  'ENTERPRISE ATTENDANCE\nMANAGEMENT PLATFORM',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.5,
                    height: 1.6,
                  ),
                ),
                const SizedBox(height: 36),

                // Workspace card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withOpacity(0.18), blurRadius: 32, offset: const Offset(0, 8)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Center(
                        child: Text(
                          'CHOOSE YOUR WORKSPACE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.8,
                            color: Color(0xFF9CA3AF),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Mode selector row
                      Row(
                        children: [
                          Expanded(child: _ModeCard(
                            label: 'Corporate',
                            sublabel: 'Businesses &\norganisations',
                            icon: Icons.work_outline,
                            selected: _mode == 'corp',
                            onTap: () => _selectMode('corp'),
                          )),
                          const SizedBox(width: 12),
                          Expanded(child: _ModeCard(
                            label: 'Academic',
                            sublabel: 'Schools &\ninstitutions',
                            icon: Icons.school_outlined,
                            selected: _mode == 'acad',
                            onTap: () => _selectMode('acad'),
                          )),
                        ],
                      ),

                      // Role list — shown after mode is chosen
                      if (_mode != null) ...[
                        const SizedBox(height: 20),
                        _SectionLabel(
                          label: _mode == 'corp' ? 'Corporate portals' : 'Academic portals',
                          color: _mode == 'corp' ? const Color(0xFF0891B2) : const Color(0xFF7C3AED),
                        ),
                        const SizedBox(height: 10),
                        ...(_mode == 'corp' ? _corpRoles : _acadRoles).map(
                          (r) => _RoleCard(role: r, onTap: () => _selectRole(r)),
                        ),
                      ],

                      const SizedBox(height: 16),
                      Center(
                        child: Text(
                          'By using DIKLY, you agree to our Terms & Conditions\nand Privacy Policy.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF), height: 1.5),
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Center(
                        child: Text(
                          '© 2026 DIKLY Technologies. All rights reserved.\nFounded by Isaac Kweku Aryeepah',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 10, color: Color(0xFFD1D5DB), height: 1.5),
                        ),
                      ),
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

  Widget _buildBrand() {
    return Column(
      children: [
        // Logo image (use icon fallback)
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.asset('assets/icon.png', fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const Icon(Icons.business, color: DiklyColors.primary, size: 40),
            ),
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'DIKLY',
          style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 3),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _dot(const Color(0xFF60A5FA)),
            const SizedBox(width: 6),
            const Text('Innovate', style: TextStyle(color: Colors.white60, fontSize: 11, letterSpacing: 1)),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('·', style: TextStyle(color: Colors.white38, fontSize: 11)),
            ),
            _dot(const Color(0xFF818CF8)),
            const SizedBox(width: 6),
            const Text('Connect', style: TextStyle(color: Colors.white60, fontSize: 11, letterSpacing: 1)),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('·', style: TextStyle(color: Colors.white38, fontSize: 11)),
            ),
            _dot(const Color(0xFF34D399)),
            const SizedBox(width: 6),
            const Text('Empower', style: TextStyle(color: Colors.white60, fontSize: 11, letterSpacing: 1)),
          ],
        ),
      ],
    );
  }

  Widget _dot(Color color) => Container(
    width: 7, height: 7,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
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
  const _ModeCard({required this.label, required this.sublabel, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFF5F3FF) : const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? const Color(0xFF7C3AED) : const Color(0xFFE5E7EB),
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: selected ? const Color(0xFF7C3AED).withOpacity(0.1) : const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 22, color: selected ? const Color(0xFF7C3AED) : const Color(0xFF9CA3AF)),
            ),
            const SizedBox(height: 10),
            Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: selected ? const Color(0xFF111827) : const Color(0xFF374151))),
            const SizedBox(height: 4),
            Text(sublabel, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280), height: 1.4)),
            const SizedBox(height: 8),
            Container(
              height: 3,
              width: 32,
              decoration: BoxDecoration(
                color: selected ? const Color(0xFF7C3AED) : Colors.transparent,
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
        Container(width: 3, height: 14, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color, letterSpacing: 0.5)),
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
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: role.color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(role.icon, color: role.color, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(role.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                  Text(role.sublabel, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Color(0xFF9CA3AF)),
          ],
        ),
      ),
    );
  }
}
