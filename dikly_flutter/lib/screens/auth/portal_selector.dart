import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

class PortalSelectorScreen extends StatefulWidget {
  const PortalSelectorScreen({super.key});

  @override
  State<PortalSelectorScreen> createState() => _PortalSelectorScreenState();
}

class _PortalSelectorScreenState extends State<PortalSelectorScreen> {
  String _selectedWorkspace = 'corporate';

  @override
  void initState() {
    super.initState();
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final isCorporate = _selectedWorkspace == 'corporate';

    return Scaffold(
      body: Stack(
        children: [
          // Background gradient (simulates dark blurred office photo)
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF1A237E),
                  Color(0xFF283593),
                  Color(0xFF1565C0),
                ],
              ),
            ),
          ),
          // Dark overlay
          Container(color: Colors.black.withOpacity(0.45)),
          // Content
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 0),
              child: Column(
                children: [
                  const SizedBox(height: 32),
                  // ── Header ──────────────────────────────────────
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 70,
                        height: 70,
                        child: Image.asset(
                          'assets/icon.png',
                          fit: BoxFit.contain,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'DIKLY',
                            style: TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF1A237E),
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'INNOVATE · CONNECT · EMPOWER',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Colors.blue[300],
                              letterSpacing: 1.5,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'ENTERPRISE ATTENDANCE MANAGEMENT PLATFORM',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // ── Frosted glass card ───────────────────────────
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 14),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.93),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
                      child: Column(
                        children: [
                          // "CHOOSE YOUR WORKSPACE" label
                          const Text(
                            'CHOOSE YOUR WORKSPACE',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF9E9E9E),
                              letterSpacing: 2,
                            ),
                          ),
                          const SizedBox(height: 12),
                          const Divider(height: 1, color: Color(0xFFE0E0E0)),
                          const SizedBox(height: 14),

                          // ── Workspace tabs ──────────────────────
                          Row(
                            children: [
                              Expanded(
                                child: _WorkspaceTab(
                                  label: 'Corporate',
                                  subtitle: 'Businesses & organisations',
                                  icon: Icons.work_rounded,
                                  iconBg: const Color(0xFFFFF3E0),
                                  iconColor: const Color(0xFFD97706),
                                  borderColor: const Color(0xFFD97706),
                                  indicatorColor: const Color(0xFFD97706),
                                  isSelected: isCorporate,
                                  onTap: () =>
                                      setState(() => _selectedWorkspace = 'corporate'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _WorkspaceTab(
                                  label: 'Academic',
                                  subtitle: 'Schools & institutions',
                                  icon: Icons.school_rounded,
                                  iconBg: const Color(0xFFEDE7F6),
                                  iconColor: const Color(0xFF3F51B5),
                                  borderColor: const Color(0xFF3F51B5),
                                  indicatorColor: const Color(0xFF3F51B5),
                                  isSelected: !isCorporate,
                                  onTap: () =>
                                      setState(() => _selectedWorkspace = 'academic'),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 18),

                          // ── Section label ───────────────────────
                          Row(
                            children: [
                              Text(
                                isCorporate ? '🏢' : '🎓',
                                style: const TextStyle(fontSize: 16),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                isCorporate
                                    ? 'CORPORATE PORTALS'
                                    : 'ACADEMIC PORTALS',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: isCorporate
                                      ? const Color(0xFFD97706)
                                      : const Color(0xFF3F51B5),
                                  letterSpacing: 1.5,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),

                          // ── Role cards ──────────────────────────
                          if (isCorporate) ...[
                            Row(
                              children: [
                                Expanded(
                                  child: _RoleCard(
                                    icon: Icons.person_rounded,
                                    iconBg: const Color(0xFFFFF3E0),
                                    iconColor: const Color(0xFFD97706),
                                    title: 'Admin',
                                    subtitle: 'Company admin',
                                    onTap: () => context.push('/login/admin'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _RoleCard(
                                    icon: Icons.group_rounded,
                                    iconBg: const Color(0xFFE8F5E9),
                                    iconColor: const Color(0xFF388E3C),
                                    title: 'Manager',
                                    subtitle: 'Team leads & managers',
                                    onTap: () => context.push('/login/manager'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _RoleCard(
                                    icon: Icons.work_rounded,
                                    iconBg: const Color(0xFFE0F2F1),
                                    iconColor: const Color(0xFF0D9488),
                                    title: 'Employee',
                                    subtitle: 'Staff & workers',
                                    onTap: () => context.push('/login/employee'),
                                  ),
                                ),
                              ],
                            ),
                          ] else ...[
                            GridView.count(
                              crossAxisCount: 2,
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              crossAxisSpacing: 8,
                              mainAxisSpacing: 8,
                              childAspectRatio: 1.1,
                              children: [
                                _RoleCard(
                                  icon: Icons.person_rounded,
                                  iconBg: const Color(0xFFEDE7F6),
                                  iconColor: const Color(0xFF3F51B5),
                                  title: 'Admin',
                                  subtitle: 'Institution admin',
                                  onTap: () => context.push('/login/admin'),
                                ),
                                _RoleCard(
                                  icon: Icons.group_rounded,
                                  iconBg: const Color(0xFFE8EAF6),
                                  iconColor: const Color(0xFF5C6BC0),
                                  title: 'Lecturer',
                                  subtitle: 'Instructors',
                                  onTap: () => context.push('/login/lecturer'),
                                ),
                                _RoleCard(
                                  icon: Icons.account_balance_rounded,
                                  iconBg: const Color(0xFFFFEBEE),
                                  iconColor: const Color(0xFFDC2626),
                                  title: 'HOD',
                                  subtitle: 'Head of Department',
                                  onTap: () => context.push('/login/hod'),
                                ),
                                _RoleCard(
                                  icon: Icons.menu_book_rounded,
                                  iconBg: const Color(0xFFE3F2FD),
                                  iconColor: const Color(0xFF2563EB),
                                  title: 'Student',
                                  subtitle: 'Learners',
                                  onTap: () => context.push('/login/student'),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                  // ── Footer ──────────────────────────────────────
                  const SizedBox(height: 24),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: const [
                        Text(
                          'By using DIKLY, you agree to our Terms & Conditions and Privacy Policy.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 10,
                            color: Color(0xFFB0BEC5),
                          ),
                        ),
                        SizedBox(height: 6),
                        Text(
                          '© 2026 DIKLY Technologies. All rights reserved.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 10,
                            color: Color(0xFFB0BEC5),
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Founded by Isaac Kweku Aryeepah',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 10,
                            color: Color(0xFFB0BEC5),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Workspace Tab Widget ──────────────────────────────────────────────────────

class _WorkspaceTab extends StatelessWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final Color borderColor;
  final Color indicatorColor;
  final bool isSelected;
  final VoidCallback onTap;

  const _WorkspaceTab({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.borderColor,
    required this.indicatorColor,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? borderColor : const Color(0xFFE0E0E0),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: iconBg,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, color: iconColor, size: 20),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF212121),
                          ),
                        ),
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontSize: 10,
                            color: Color(0xFF9E9E9E),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Indicator bar at bottom
            Container(
              height: isSelected ? 4 : 2,
              decoration: BoxDecoration(
                color: isSelected ? indicatorColor : const Color(0xFFEEEEEE),
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(12),
                  bottomRight: Radius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Role Card Widget ──────────────────────────────────────────────────────────

class _RoleCard extends StatelessWidget {
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _RoleCard({
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE0E0E0)),
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
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconBg,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Color(0xFF212121),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 10,
                color: Color(0xFF9E9E9E),
              ),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.bottomRight,
              child: Icon(
                Icons.arrow_forward_ios_rounded,
                size: 11,
                color: iconColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
