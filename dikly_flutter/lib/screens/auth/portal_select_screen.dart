import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';

class PortalSelectScreen extends StatelessWidget {
  const PortalSelectScreen({super.key});

  static const _portals = [
    _Portal('student', 'Student Portal', 'Academic learning & attendance', Icons.school_outlined, DiklyColors.primary),
    _Portal('lecturer', 'Lecturer Portal', 'Manage classes & assignments', Icons.cast_for_education_outlined, Color(0xFF7C3AED)),
    _Portal('manager', 'Manager Portal', 'HR, timesheets & team management', Icons.business_center_outlined, Color(0xFF059669)),
    _Portal('admin', 'Admin Portal', 'Full platform administration', Icons.admin_panel_settings_outlined, Color(0xFFDC2626)),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 32),
              _buildBrand(),
              const SizedBox(height: 8),
              Text('Choose your portal to continue',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary)),
              const SizedBox(height: 40),
              Expanded(
                child: ListView.separated(
                  itemCount: _portals.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _PortalCard(portal: _portals[i]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBrand() {
    return Row(
      children: [
        Container(
          width: 48, height: 48,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [DiklyColors.primary, Color(0xFF7C3AED)],
              begin: Alignment.topLeft, end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(color: DiklyColors.primary.withOpacity(0.35), blurRadius: 16, offset: const Offset(0, 6))],
          ),
          child: const Center(child: Text('D', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800))),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text('Dikly', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.textPrimary)),
            Text('Academic & Corporate Platform', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
          ],
        ),
      ],
    );
  }
}

class _Portal {
  final String id, title, subtitle;
  final IconData icon;
  final Color color;
  const _Portal(this.id, this.title, this.subtitle, this.icon, this.color);
}

class _PortalCard extends StatelessWidget {
  final _Portal portal;
  const _PortalCard({required this.portal});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push('/login/${portal.id}'),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: DiklyColors.border),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: portal.color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(portal.icon, color: portal.color, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(portal.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: DiklyColors.textPrimary)),
                  const SizedBox(height: 2),
                  Text(portal.subtitle, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: portal.color, size: 20),
          ],
        ),
      ),
    );
  }
}
