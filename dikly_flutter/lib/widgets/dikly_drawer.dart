import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme.dart';

class DrawerItem {
  final IconData icon;
  final String label;
  final String route;
  const DrawerItem(this.icon, this.label, this.route);
}

class DrawerSection {
  final String? header;
  final List<DrawerItem> items;
  const DrawerSection({this.header, required this.items});
}

/// Shared sidebar drawer matching the website design.
/// White background, DIKLY logo at top, grouped sections,
/// active item: left border + tint + colored icon/text.
class DiklyDrawer extends StatelessWidget {
  final String portalTitle;
  final Color accentColor;
  final String userName;
  final String userEmail;
  final String userRole;
  final List<DrawerSection> sections;
  final VoidCallback onSignOut;
  final String? activeRoute;

  const DiklyDrawer({
    super.key,
    required this.portalTitle,
    required this.accentColor,
    required this.userName,
    required this.userEmail,
    required this.userRole,
    required this.sections,
    required this.onSignOut,
    this.activeRoute,
  });

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: Colors.white,
      child: SafeArea(
        child: Column(
          children: [
            // ── Header ────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Logo row
                  Row(
                    children: [
                      Image.asset('assets/icon.png', width: 40, height: 40),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'DIKLY',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF1A237E),
                            ),
                          ),
                          Text(
                            portalTitle,
                            style: TextStyle(
                              fontSize: 11,
                              color: accentColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  // User info
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: accentColor.withOpacity(0.12),
                        child: Text(
                          userName.isNotEmpty ? userName[0].toUpperCase() : 'U',
                          style: TextStyle(
                            color: accentColor,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              userName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: DiklyColors.textPrimary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              userEmail,
                              style: const TextStyle(
                                fontSize: 11,
                                color: DiklyColors.textSecondary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: accentColor.withOpacity(0.10),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      userRole.toUpperCase(),
                      style: TextStyle(
                        fontSize: 10,
                        color: accentColor,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFFEEEEEE)),

            // ── Menu items ────────────────────────────────────────────
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 8, bottom: 16),
                children: [
                  for (final section in sections) ...[
                    if (section.header != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                        child: Text(
                          section.header!,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF9E9E9E),
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    for (final item in section.items)
                      _DrawerTile(
                        item: item,
                        accentColor: accentColor,
                        isActive: activeRoute == item.route,
                        onTap: () {
                          Navigator.pop(context);
                          context.push(item.route);
                        },
                      ),
                  ],
                  const Divider(height: 24, color: Color(0xFFEEEEEE)),
                  // Sign out
                  _DrawerTile(
                    item: const DrawerItem(Icons.logout, 'Sign Out', ''),
                    accentColor: DiklyColors.error,
                    isActive: false,
                    onTap: onSignOut,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerTile extends StatelessWidget {
  final DrawerItem item;
  final Color accentColor;
  final bool isActive;
  final VoidCallback onTap;

  const _DrawerTile({
    required this.item,
    required this.accentColor,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = isActive ? accentColor : const Color(0xFF4B5563);
    return InkWell(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        decoration: BoxDecoration(
          color: isActive ? accentColor.withOpacity(0.07) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: isActive
              ? Border(left: BorderSide(color: accentColor, width: 3))
              : null,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              Icon(item.icon, size: 20, color: color),
              const SizedBox(width: 14),
              Text(
                item.label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
