import 'package:flutter/material.dart';

enum BadgeStyle { filled, outlined, soft }

/// Status badge: Approved (green), Closed (red), Active (green), Archived (grey), Pending (amber).
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

  factory DiklyBadge.approved() => const DiklyBadge(label: 'Approved', color: Color(0xFF16A34A));
  factory DiklyBadge.pending() => const DiklyBadge(label: 'Pending', color: Color(0xFFD97706));
  factory DiklyBadge.closed() => const DiklyBadge(label: 'Closed', color: Color(0xFFDC2626), style: BadgeStyle.outlined);
  factory DiklyBadge.active() => const DiklyBadge(label: 'Active', color: Color(0xFF16A34A));
  factory DiklyBadge.archived() => const DiklyBadge(label: '• Archived', color: Color(0xFF9CA3AF));
  factory DiklyBadge.live() => const DiklyBadge(label: 'Live', color: Color(0xFF16A34A));

  @override
  Widget build(BuildContext context) {
    final bg = style == BadgeStyle.filled
        ? color
        : style == BadgeStyle.outlined
            ? Colors.transparent
            : color.withOpacity(0.1);
    final textColor = style == BadgeStyle.filled ? Colors.white : color;
    final border = style == BadgeStyle.outlined ? Border.all(color: color) : null;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: border,
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w600, color: textColor),
      ),
    );
  }
}
