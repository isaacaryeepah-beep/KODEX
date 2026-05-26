import 'package:flutter/material.dart';

/// Small chip with icon + label — used for duration, marks, dates, etc.
class DiklyInfoChip extends StatelessWidget {
  final IconData? icon;
  final String label;
  final Color color;
  final Color bg;

  const DiklyInfoChip({
    super.key,
    this.icon,
    required this.label,
    this.color = const Color(0xFF6B7280),
    this.bg = const Color(0xFFF3F4F6),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(label, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
