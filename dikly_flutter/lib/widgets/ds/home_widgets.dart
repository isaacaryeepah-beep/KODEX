import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme.dart';

// ── Role theme ──────────────────────────────────────────────────────────────

class DiklyRoleTheme {
  final Color primary;
  final Color dark;
  final List<Color> gradient;

  const DiklyRoleTheme({
    required this.primary,
    required this.dark,
    required this.gradient,
  });

  static const student = DiklyRoleTheme(
    primary: Color(0xFF7C3AED),
    dark:    Color(0xFF6D28D9),
    gradient: [Color(0xFF5B21B6), Color(0xFF7C3AED)],
  );
  static const lecturer = DiklyRoleTheme(
    primary: Color(0xFFD97706),
    dark:    Color(0xFFB45309),
    gradient: [Color(0xFF92400E), Color(0xFFD97706)],
  );
  static const admin = DiklyRoleTheme(
    primary: Color(0xFF4F46E5),
    dark:    Color(0xFF3730A3),
    gradient: [Color(0xFF312E81), Color(0xFF4F46E5)],
  );
  static const hod = DiklyRoleTheme(
    primary: Color(0xFF6366F1),
    dark:    Color(0xFF4F46E5),
    gradient: [Color(0xFF312E81), Color(0xFF6366F1)],
  );
  static const manager = DiklyRoleTheme(
    primary: Color(0xFF4F6EF7),
    dark:    Color(0xFF3B55D6),
    gradient: [Color(0xFF3730A3), Color(0xFF4F6EF7)],
  );
  static const employee = DiklyRoleTheme(
    primary: Color(0xFF059669),
    dark:    Color(0xFF047857),
    gradient: [Color(0xFF064E3B), Color(0xFF059669)],
  );

  static DiklyRoleTheme forRole(String role) {
    switch (role) {
      case 'lecturer': return lecturer;
      case 'admin':    return admin;
      case 'hod':      return hod;
      case 'manager':  return manager;
      case 'employee': return employee;
      default:         return student;
    }
  }
}

// ── Hero section ─────────────────────────────────────────────────────────────

class DiklyHeroSection extends StatelessWidget {
  final List<Color> gradient;
  final String greeting;
  final String subtitle;
  final List<DiklyHeaderStat> stats;
  final Widget? badge;

  const DiklyHeroSection({
    super.key,
    required this.gradient,
    required this.greeting,
    required this.subtitle,
    required this.stats,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (badge != null) ...[badge!, const SizedBox(height: 10)],
          Text(
            greeting,
            style: GoogleFonts.dmSans(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: GoogleFonts.dmSans(
              fontSize: 13,
              color: Colors.white70,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (stats.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                for (int i = 0; i < stats.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(child: stats[i]),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ── Header stat bubble ────────────────────────────────────────────────────────

class DiklyHeaderStat extends StatelessWidget {
  final String value;
  final String label;
  final IconData? icon;

  const DiklyHeaderStat({
    super.key,
    required this.value,
    required this.label,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null)
            Icon(icon, color: Colors.white70, size: 14),
          if (icon != null) const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.dmSans(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.dmSans(
              fontSize: 10,
              color: Colors.white70,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ── Page body container (rounded top) ────────────────────────────────────────

class DiklyPageBody extends StatelessWidget {
  final Widget child;

  const DiklyPageBody({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF8FAFC),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        clipBehavior: Clip.hardEdge,
        child: child,
      ),
    );
  }
}

// ── Quick action chip ─────────────────────────────────────────────────────────

class DiklyQuickChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const DiklyQuickChip({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        margin: const EdgeInsets.only(right: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.dmSans(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class DiklySectionRow extends StatelessWidget {
  final String title;
  final int? count;
  final String viewAllLabel;
  final VoidCallback? onViewAll;

  const DiklySectionRow({
    super.key,
    required this.title,
    this.count,
    this.viewAllLabel = 'View all',
    this.onViewAll,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Text(
                  title,
                  style: GoogleFonts.dmSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.text,
                  ),
                ),
                if (count != null && count! > 0) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: DiklyColors.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '$count',
                      style: GoogleFonts.dmSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.primary,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (onViewAll != null)
            GestureDetector(
              onTap: onViewAll,
              child: Text(
                viewAllLabel,
                style: GoogleFonts.dmSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: DiklyColors.primary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Timeline / list row ───────────────────────────────────────────────────────

class DiklyListTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? badge;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color accentColor;
  final IconData? leadingIcon;

  const DiklyListTile({
    super.key,
    required this.title,
    this.subtitle,
    this.badge,
    this.trailing,
    this.onTap,
    this.accentColor = DiklyColors.primary,
    this.leadingIcon,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE4E4E7)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            // Left accent bar
            Container(
              width: 4,
              height: 56,
              decoration: BoxDecoration(
                color: accentColor,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  bottomLeft: Radius.circular(12),
                ),
              ),
            ),
            const SizedBox(width: 12),
            if (leadingIcon != null) ...[
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(leadingIcon, size: 18, color: accentColor),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.dmSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.text,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: GoogleFonts.dmSans(
                        fontSize: 11,
                        color: DiklyColors.textMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            if (badge != null) ...[const SizedBox(width: 8), badge!],
            const SizedBox(width: 8),
            if (trailing != null) trailing!
            else if (onTap != null)
              const Icon(Icons.chevron_right_rounded, size: 18, color: Color(0xFFD1D5DB)),
            const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

class DiklyStatusPill extends StatelessWidget {
  final String label;
  final Color color;
  final bool live;

  const DiklyStatusPill({
    super.key,
    required this.label,
    required this.color,
    this.live = false,
  });

  factory DiklyStatusPill.fromStatus(String status) {
    final s = status.toLowerCase();
    if (s == 'active' || s == 'live' || s == 'open') {
      return DiklyStatusPill(label: s == 'live' ? 'LIVE' : status, color: const Color(0xFF16A34A), live: true);
    } else if (s == 'closed' || s == 'ended' || s == 'done') {
      return DiklyStatusPill(label: status, color: const Color(0xFF6B7280));
    } else if (s == 'pending' || s == 'scheduled') {
      return DiklyStatusPill(label: status, color: const Color(0xFFD97706));
    } else {
      return DiklyStatusPill(label: status, color: DiklyColors.primary);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (live) ...[
            _LiveDot(color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label.toUpperCase(),
            style: GoogleFonts.dmSans(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveDot extends StatefulWidget {
  final Color color;
  const _LiveDot({required this.color});

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _anim,
      child: Container(
        width: 6,
        height: 6,
        decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
      ),
    );
  }
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

class DiklyShimmerCard extends StatelessWidget {
  final double height;
  final double? width;
  final double borderRadius;

  const DiklyShimmerCard({
    super.key,
    this.height = 72,
    this.width,
    this.borderRadius = 12,
  });

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFFE4E4E7),
      highlightColor: const Color(0xFFF4F4F5),
      child: Container(
        height: height,
        width: width ?? double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}

class DiklyShimmerList extends StatelessWidget {
  final int count;
  const DiklyShimmerList({super.key, this.count = 3});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(count, (_) => const DiklyShimmerCard()),
    );
  }
}

class DiklyShimmerGrid extends StatelessWidget {
  const DiklyShimmerGrid({super.key});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: List.generate(4, (_) => const DiklyShimmerCard(height: double.infinity, borderRadius: 14)),
    );
  }
}

// ── Fade + slide up animation ─────────────────────────────────────────────────

class DiklyFadeIn extends StatefulWidget {
  final Widget child;
  final Duration delay;
  final Duration duration;

  const DiklyFadeIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = const Duration(milliseconds: 350),
  });

  @override
  State<DiklyFadeIn> createState() => _DiklyFadeInState();
}

class _DiklyFadeInState extends State<DiklyFadeIn> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: widget.duration);
    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _slide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));

    Future.delayed(widget.delay, () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _slide, child: widget.child),
    );
  }
}

// ── Gradient stat card (2x2 grid) ────────────────────────────────────────────

class DiklyGradientStat extends StatelessWidget {
  final String value;
  final String label;
  final IconData icon;
  final Color color;
  final String? trend;

  const DiklyGradientStat({
    super.key,
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
    this.trend,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color, color.withOpacity(0.75)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: Colors.white),
              ),
              if (trend != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    trend!,
                    style: GoogleFonts.dmSans(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: GoogleFonts.dmSans(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1.0,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.dmSans(
              fontSize: 11,
              color: Colors.white.withOpacity(0.8),
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class DiklyEmptyCard extends StatelessWidget {
  final IconData icon;
  final String message;

  const DiklyEmptyCard({super.key, required this.icon, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE4E4E7)),
      ),
      child: Column(
        children: [
          Icon(icon, size: 32, color: const Color(0xFFD1D5DB)),
          const SizedBox(height: 8),
          Text(
            message,
            style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ── Quick action menu item ────────────────────────────────────────────────────

class DiklyMenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final int? badge;
  final VoidCallback onTap;

  const DiklyMenuRow({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    this.badge,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.dmSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: DiklyColors.text,
                ),
              ),
            ),
            if (badge != null && badge! > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: DiklyColors.error,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$badge',
                  style: GoogleFonts.dmSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              )
            else
              const Icon(Icons.chevron_right_rounded, size: 18, color: Color(0xFFD1D5DB)),
          ],
        ),
      ),
    );
  }
}
