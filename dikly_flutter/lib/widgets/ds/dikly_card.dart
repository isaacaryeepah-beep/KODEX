import 'package:flutter/material.dart';

/// Standard white card with shadow used across all DIKLY screens.
class DiklyCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;
  final Color? color;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Border? border; // optional colored top border (for stat cards)

  const DiklyCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = 12,
    this.color,
    this.margin,
    this.onTap,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: BorderRadius.circular(borderRadius),
        border: border,
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
    if (onTap != null) return GestureDetector(onTap: onTap, child: card);
    return card;
  }
}
