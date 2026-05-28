import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

enum BadgeStyle { filled, outlined, soft }

/// NextUI-style pill badge using semantic colors.
/// success #17C964 · warning #F5A524 · danger #F31260 · info #006FEE
class DiklyBadge extends StatelessWidget {
  final String label;
  final Color color;
  final BadgeStyle style;
  final double fontSize;

  const DiklyBadge({
    super.key,
    required this.label,
    required this.color,
    this.style = BadgeStyle.soft,
    this.fontSize = 11,
  });

  // Semantic factory constructors
  factory DiklyBadge.approved() => const DiklyBadge(
        label: 'Approved',
        color: Color(0xFF17C964),
      );
  factory DiklyBadge.pending() => const DiklyBadge(
        label: 'Pending',
        color: Color(0xFFF5A524),
      );
  factory DiklyBadge.closed() => const DiklyBadge(
        label: 'Closed',
        color: Color(0xFFF31260),
        style: BadgeStyle.soft,
      );
  factory DiklyBadge.active() => const DiklyBadge(
        label: 'Active',
        color: Color(0xFF17C964),
      );
  factory DiklyBadge.archived() => const DiklyBadge(
        label: 'Archived',
        color: Color(0xFFA1A1AA),
      );
  factory DiklyBadge.live() => const DiklyBadge(
        label: 'Live',
        color: Color(0xFF17C964),
      );
  factory DiklyBadge.info({String label = 'Info'}) => DiklyBadge(
        label: label,
        color: const Color(0xFF006FEE),
      );

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color textColor;
    final Border? border;

    switch (style) {
      case BadgeStyle.filled:
        bg = color;
        textColor = Colors.white;
        border = null;
        break;
      case BadgeStyle.outlined:
        bg = color.withOpacity(0.06);
        textColor = color;
        border = Border.all(color: color, width: 1);
        break;
      case BadgeStyle.soft:
      default:
        bg = color.withOpacity(0.12);
        textColor = color;
        border = null;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: border,
      ),
      child: Text(
        label,
        style: GoogleFonts.dmSans(
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }
}
