import 'package:flutter/material.dart';

/// Uppercase section label — used in forms and drawers.
class DiklySectionLabel extends StatelessWidget {
  final String text;
  const DiklySectionLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Color(0xFF9CA3AF),
          letterSpacing: 1.5,
        ),
      ),
    );
  }
}
