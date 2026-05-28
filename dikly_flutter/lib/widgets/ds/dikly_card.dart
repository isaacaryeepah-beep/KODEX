import 'package:flutter/material.dart';
import '../../core/theme.dart';

/// Standard white card matching the NextUI-inspired clean design.
/// White surface · zinc-200 border · shadowSm · optional InkWell tap.
class DiklyCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;
  final Color? color;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Border? border;

  /// When true, renders a 2px indigo border (highlighted state).
  final bool highlighted;

  const DiklyCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = 14,
    this.color,
    this.margin,
    this.onTap,
    this.border,
    this.highlighted = false,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveBorder = highlighted
        ? Border.all(color: DiklyColors.primary, width: 2)
        : border ?? Border.all(color: const Color(0xFFE4E4E7), width: 1);

    final decoration = BoxDecoration(
      color: color ?? Colors.white,
      borderRadius: BorderRadius.circular(borderRadius),
      border: effectiveBorder,
      boxShadow: AppTheme.shadowSm,
    );

    final content = Container(
      margin: margin,
      padding: padding,
      decoration: decoration,
      child: child,
    );

    if (onTap != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(borderRadius),
          splashColor: DiklyColors.primary.withOpacity(0.06),
          highlightColor: DiklyColors.primary.withOpacity(0.04),
          child: content,
        ),
      );
    }

    return content;
  }
}
