import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
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

// Web-matching light sidebar palette (matches web mobile drawer)
const _bg        = Colors.white;
const _surface   = Color(0x0F000000); // rgba(0,0,0,0.06) — active item tint
const _border    = Color(0x12000000); // rgba(0,0,0,0.07) — item separator
const _textInact = Color(0xFF6B7280); // gray-500 — inactive text
const _textMuted = Color(0xFF9CA3AF); // gray-400 — section headers
const _textDark  = Color(0xFF0D1117); // near-black — logo + name

/// Shared sidebar drawer — white/light aesthetic matching the web portal sidebar.
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
      backgroundColor: _bg,
      child: SafeArea(
        child: Column(
          children: [
            // ── Header ────────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 14),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: _border)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Logo row
                  Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.asset(
                          'assets/icon.png',
                          width: 34,
                          height: 34,
                          fit: BoxFit.contain,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'DIKLY',
                            style: GoogleFonts.dmSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: _textDark,
                              letterSpacing: -0.2,
                            ),
                          ),
                          Text(
                            portalTitle,
                            style: GoogleFonts.dmSans(
                              fontSize: 11,
                              color: accentColor,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // User info
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: accentColor.withOpacity(0.12),
                        child: Text(
                          userName.isNotEmpty ? userName[0].toUpperCase() : 'U',
                          style: TextStyle(
                            color: accentColor,
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
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
                              style: GoogleFonts.dmSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: _textDark,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              userEmail,
                              style: GoogleFonts.dmSans(
                                fontSize: 11,
                                color: _textMuted,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: accentColor.withOpacity(0.10),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      userRole.toUpperCase(),
                      style: GoogleFonts.dmSans(
                        fontSize: 10,
                        color: accentColor,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Menu items ────────────────────────────────────────────
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 4, bottom: 16),
                children: [
                  for (final section in sections) ...[
                    if (section.header != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 14, 16, 2),
                        child: Text(
                          section.header!,
                          style: GoogleFonts.dmSans(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: _textMuted,
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
                  const Divider(color: _border, height: 1),
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
    final iconColor = isActive ? accentColor : _textMuted;
    final textColor = isActive ? accentColor : _textInact;

    return InkWell(
      onTap: onTap,
      highlightColor: Colors.black.withOpacity(0.03),
      splashColor: Colors.black.withOpacity(0.04),
      child: Container(
        decoration: BoxDecoration(
          color: isActive ? _surface : Colors.transparent,
          border: const Border(bottom: BorderSide(color: _border)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        child: Row(
          children: [
            Icon(item.icon, size: 18, color: iconColor),
            const SizedBox(width: 12),
            Text(
              item.label,
              style: GoogleFonts.dmSans(
                fontSize: 13,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
                color: textColor,
                letterSpacing: 0.1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
