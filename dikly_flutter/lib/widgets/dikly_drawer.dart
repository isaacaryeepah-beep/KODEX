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

// Dark zinc sidebar palette
const _bg        = Color(0xFF18181B); // zinc-900
const _surface   = Color(0xFF27272A); // zinc-800 — active item
const _border    = Color(0xFF3F3F46); // zinc-700 — divider
const _textInact = Color(0xFFD4D4D8); // zinc-300 — inactive text
const _textMuted = Color(0xFF71717A); // zinc-500 — section headers
const _textWhite = Colors.white;

/// Shared sidebar drawer — dark zinc aesthetic.
/// Dark #18181B background, section headers in zinc-500,
/// active item pill in zinc-800 with white text + indigo icon.
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Logo row
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF6366F1), Color(0xFF4F46E5)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Center(
                          child: Text(
                            'D',
                            style: GoogleFonts.dmSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1.0,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'DIKLY',
                            style: GoogleFonts.dmSans(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: _textWhite,
                              letterSpacing: 0.5,
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
                  const SizedBox(height: 18),
                  // User info
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: accentColor.withOpacity(0.20),
                        child: Text(
                          userName.isNotEmpty ? userName[0].toUpperCase() : 'U',
                          style: TextStyle(
                            color: accentColor,
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
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
                                color: _textWhite,
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
                      color: accentColor.withOpacity(0.15),
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
            const Divider(height: 1, color: _border),

            // ── Menu items ────────────────────────────────────────────
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 8, bottom: 16),
                children: [
                  for (final section in sections) ...[
                    if (section.header != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
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
                  const Divider(height: 24, color: _border),
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
    final iconColor = isActive ? DiklyColors.primary : _textMuted;
    final textColor = isActive ? _textWhite : _textInact;

    return InkWell(
      onTap: onTap,
      highlightColor: Colors.white.withOpacity(0.04),
      splashColor: Colors.white.withOpacity(0.06),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: isActive ? _surface : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(item.icon, size: 18, color: iconColor),
            const SizedBox(width: 12),
            Text(
              item.label,
              style: GoogleFonts.dmSans(
                fontSize: 14,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                color: textColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
