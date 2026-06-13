import 'package:flutter/material.dart';

/// Standard page header: large title, subtitle, optional trailing action widget.
class DiklyScreenHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  /// Optional rich-text widget to replace [subtitle] when bold/color styling is needed.
  final Widget? subtitleWidget;
  final Widget? action;
  final EdgeInsetsGeometry padding;

  const DiklyScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.subtitleWidget,
    this.action,
    this.padding = const EdgeInsets.fromLTRB(0, 0, 0, 16),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                    height: 1.2,
                  ),
                ),
                if (subtitleWidget != null) ...[
                  const SizedBox(height: 3),
                  subtitleWidget!,
                ] else if (subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF6B7280),
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (action != null) ...[
            const SizedBox(width: 12),
            action!,
          ],
        ],
      ),
    );
  }
}
