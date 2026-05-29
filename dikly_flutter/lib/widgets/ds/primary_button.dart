import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/theme.dart';

enum DiklyButtonVariant { solid, outlined, ghost }

/// Clean NextUI-style button.
/// • solid   — indigo fill, white text
/// • outlined — white bg, indigo border + text
/// • ghost   — transparent, text only
class DiklyPrimaryButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;
  final bool fullWidth;
  final Color? color;
  final double height;
  final DiklyButtonVariant variant;

  const DiklyPrimaryButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.loading = false,
    this.fullWidth = true,
    this.color,
    this.height = 48,
    this.variant = DiklyButtonVariant.solid,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? DiklyColors.primary;

    Widget content = loading
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: variant == DiklyButtonVariant.solid
                  ? Colors.white
                  : effectiveColor,
            ),
          )
        : Row(
            mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: GoogleFonts.dmSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          );

    switch (variant) {
      case DiklyButtonVariant.outlined:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: height,
          child: OutlinedButton(
            onPressed: loading ? null : onPressed,
            style: OutlinedButton.styleFrom(
              foregroundColor: effectiveColor,
              backgroundColor: Colors.white,
              side: BorderSide(color: effectiveColor, width: 1.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
            child: content,
          ),
        );

      case DiklyButtonVariant.ghost:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: height,
          child: TextButton(
            onPressed: loading ? null : onPressed,
            style: TextButton.styleFrom(
              foregroundColor: effectiveColor,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
            child: content,
          ),
        );

      case DiklyButtonVariant.solid:
        return SizedBox(
          width: fullWidth ? double.infinity : null,
          height: height,
          child: ElevatedButton(
            onPressed: loading ? null : onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: effectiveColor,
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFE4E4E7),
              disabledForegroundColor: DiklyColors.textMuted,
              elevation: 0,
              shadowColor: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
            child: content,
          ),
        );
    }
  }
}
