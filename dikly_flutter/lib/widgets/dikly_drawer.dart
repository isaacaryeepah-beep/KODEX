import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

// Web sidebar palette — frosted-glass look adapted to mobile
const _bg        = Colors.white;
const _border    = Color(0x1ADCB978); // warm golden border (web: rgba(220,185,120,0.28))
const _textInact = Color(0xFF9CA3AF); // gray-400 — inactive text (web sidebar)
const _textMuted = Color(0xFF9CA3AF); // gray-400 — section headers
const _textDark  = Color(0xFF0D1117); // near-black — logo + name
// Active item: amber/golden highlight (web: rgba(255,240,185,0.65))
const _activeItemBg   = Color(0xFFFFF5CC); // amber tint
const _activeItemText = Color(0xFF92400E); // amber-800 — matching web active color

/// Shared sidebar drawer — white aesthetic matching the web portal sidebar.
/// Active item has amber/golden background highlight exactly as the web.
class DiklyDrawer extends StatelessWidget {
  final String portalTitle;
  final Color accentColor;
  final String userName;
  final String userEmail;
  final String userRole;
  final List<DrawerSection> sections;
  final VoidCallback onSignOut;
  final String? institutionCode;

  const DiklyDrawer({
    super.key,
    required this.portalTitle,
    required this.accentColor,
    required this.userName,
    required this.userEmail,
    required this.userRole,
    required this.sections,
    required this.onSignOut,
    this.institutionCode,
  });

  @override
  Widget build(BuildContext context) {
    final currentRoute = GoRouterState.of(context).uri.toString();

    return Drawer(
      backgroundColor: _bg,
      surfaceTintColor: Colors.transparent,
      child: SafeArea(
        child: Column(
          children: [
            // ── Header: DIKLY logo + portal + user ───────────────────
            Container(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Logo row
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: const Color(0xFF0D1117),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.bolt, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'DIKLY',
                            style: GoogleFonts.dmSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: _textDark,
                              letterSpacing: -0.3,
                            ),
                          ),
                          Text(
                            portalTitle,
                            style: GoogleFonts.dmSans(
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
                        radius: 17,
                        backgroundColor: accentColor.withOpacity(0.12),
                        child: Text(
                          userName.isNotEmpty ? userName[0].toUpperCase() : 'U',
                          style: TextStyle(
                            color: accentColor,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
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
                              style: GoogleFonts.dmSans(fontSize: 11, color: _textMuted),
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
                        fontSize: 9,
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
                padding: const EdgeInsets.only(top: 4, bottom: 8),
                children: [
                  for (final section in sections) ...[
                    if (section.header != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 3),
                        child: Text(
                          section.header!,
                          style: GoogleFonts.dmSans(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: _textMuted,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    for (final item in section.items)
                      _DrawerTile(
                        item: item,
                        accentColor: accentColor,
                        isActive: _isActive(currentRoute, item.route),
                        onTap: () {
                          Navigator.pop(context);
                          context.go(item.route);
                        },
                      ),
                  ],
                ],
              ),
            ),

            // ── Bottom: Institution code + Sign out ───────────────────
            Container(
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: Color(0xFFE5E7EB))),
              ),
              child: Column(
                children: [
                  if (institutionCode != null && institutionCode!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'INSTITUTION CODE',
                            style: GoogleFonts.dmSans(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: _textMuted,
                              letterSpacing: 1.2,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Text(
                                institutionCode!,
                                style: GoogleFonts.dmSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: _textDark,
                                  letterSpacing: 1.0,
                                ),
                              ),
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: () {
                                  Clipboard.setData(ClipboardData(text: institutionCode!));
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Code copied'),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF3F4F6),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: const Color(0xFFE5E7EB)),
                                  ),
                                  child: Text(
                                    'Copy',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: const Color(0xFF374151),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  InkWell(
                    onTap: onSignOut,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.logout_rounded, size: 17, color: DiklyColors.error),
                          const SizedBox(width: 12),
                          Text(
                            'Sign Out',
                            style: GoogleFonts.dmSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: DiklyColors.error,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isActive(String currentRoute, String itemRoute) {
    if (itemRoute.isEmpty) return false;
    // Exact match for dashboard routes, prefix match for others
    if (itemRoute == '/dashboard/student' || itemRoute == '/dashboard/lecturer' ||
        itemRoute == '/dashboard/admin' || itemRoute == '/dashboard/hod' ||
        itemRoute == '/dashboard/manager' || itemRoute == '/dashboard/employee') {
      return currentRoute == itemRoute;
    }
    return currentRoute.startsWith(itemRoute);
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
    return InkWell(
      onTap: onTap,
      highlightColor: const Color(0x0FDCB978),
      splashColor: const Color(0x0ADCB978),
      child: Container(
        decoration: BoxDecoration(
          color: isActive ? _activeItemBg : Colors.transparent,
          border: const Border(
            bottom: BorderSide(color: Color(0x1ADCB978)),
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        child: Row(
          children: [
            Icon(
              item.icon,
              size: 17,
              color: isActive ? _activeItemText : _textInact,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                item.label,
                style: GoogleFonts.dmSans(
                  fontSize: 12.5,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
                  color: isActive ? _activeItemText : _textInact,
                  letterSpacing: 0.1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
