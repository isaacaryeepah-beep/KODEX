import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class DiklyColors {
  // Primary — Dikly brand blue (#2563EB)
  static const Color primary       = Color(0xFF2563EB);
  static const Color primaryDark   = Color(0xFF1D4ED8);
  static const Color primaryLight  = Color(0xFF3B82F6);
  static const Color primaryULight = Color(0xFFEFF6FF);

  // Semantic (web design tokens)
  static const Color success       = Color(0xFF16A34A);
  static const Color successLight  = Color(0xFFDCFCE7);
  static const Color warning       = Color(0xFFD97706);
  static const Color warningLight  = Color(0xFFFEF9C3);
  static const Color error         = Color(0xFFDC2626);
  static const Color errorLight    = Color(0xFFFEE2E2);
  static const Color info          = Color(0xFF006FEE);
  static const Color infoLight     = Color(0xFFE6F1FE);

  // Surface / BG
  static const Color background    = Color(0xFFF4F6F9);
  static const Color surface       = Color(0xFFFFFFFF);
  static const Color surfaceHover  = Color(0xFFF3F4F6);

  // Text
  static const Color text          = Color(0xFF0D1117);
  static const Color textSecondary = Color(0xFF374151);
  static const Color textLight     = Color(0xFF6B7280);
  static const Color textMuted     = Color(0xFF9CA3AF);

  // Border
  static const Color border        = Color(0xFFE5E7EB);
  static const Color borderFocus   = Color(0xFF9CA3AF);
  static const Color borderLight   = Color(0xFFF3F4F6);

  // Grays (zinc scale kept for compat)
  static const Color grey50  = Color(0xFFFAFAFA);
  static const Color grey100 = Color(0xFFF4F4F5);
  static const Color grey200 = Color(0xFFE5E7EB);
  static const Color grey300 = Color(0xFFD4D4D8);
  static const Color grey400 = Color(0xFFA1A1AA);
  static const Color grey500 = Color(0xFF71717A);
  static const Color grey600 = Color(0xFF52525B);
  static const Color grey700 = Color(0xFF3F3F46);
  static const Color grey800 = Color(0xFF27272A);
  static const Color grey900 = Color(0xFF18181B);

  // Dark (compat — kept for dark theme / snackbar)
  static const Color darkBackground = Color(0xFF0F0F23);
  static const Color darkSurface    = Color(0xFF18181B);  // zinc-900
  static const Color darkBorder     = Color(0xFF27272A);  // zinc-800

  // Sidebar — dark zinc
  static const Color sidebarBg     = Color(0xFF18181B);  // zinc-900
  static const Color sidebarText   = Color(0xFFD4D4D8);  // zinc-300
  static const Color sidebarActive = Color(0xFF6366F1);  // indigo-500

  // Gradient presets (cleaner indigo-only pairs)
  static const List<Color> gradientPrimary  = [Color(0xFF6366F1), Color(0xFF4F46E5)];
  static const List<Color> gradientPurple   = [Color(0xFF7C3AED), Color(0xFF6366F1)];
  static const List<Color> gradientGreen    = [Color(0xFF17C964), Color(0xFF12A153)];
  static const List<Color> gradientAmber    = [Color(0xFFF5A524), Color(0xFFD97706)];
  static const List<Color> gradientRose     = [Color(0xFFF31260), Color(0xFFBE185D)];
  static const List<Color> gradientCyan     = [Color(0xFF06B6D4), Color(0xFF0891B2)];
  static const List<Color> gradientNavy     = [Color(0xFF18181B), Color(0xFF09090B)];

  // Compat aliases
  static const Color textPrimary    = text;
  static const Color cardShadow     = Color(0x0D000000);
  static const Color primaryDarkAlt = Color(0xFF4F46E5);
  static const Color successDark    = Color(0xFF12A153);
  static const Color authBg         = Color(0xFF0F0F23);
}

class AppTheme {
  static TextStyle _dm(double size, FontWeight weight,
      {Color? color, double? letterSpacing, double? height}) =>
      GoogleFonts.dmSans(
        fontSize: size,
        fontWeight: weight,
        color: color,
        letterSpacing: letterSpacing,
        height: height,
      );

  static TextTheme get _textTheme {
    return const TextTheme().copyWith(
      displayLarge:   _dm(36, FontWeight.w800, letterSpacing: -1.0),
      displayMedium:  _dm(30, FontWeight.w700, letterSpacing: -0.5),
      displaySmall:   _dm(26, FontWeight.w600),
      headlineLarge:  _dm(24, FontWeight.w700),
      headlineMedium: _dm(20, FontWeight.w600),
      headlineSmall:  _dm(18, FontWeight.w600),
      titleLarge:     _dm(17, FontWeight.w600),
      titleMedium:    _dm(15, FontWeight.w500),
      titleSmall:     _dm(14, FontWeight.w500),
      bodyLarge:      _dm(16, FontWeight.w400, height: 1.6),
      bodyMedium:     _dm(14, FontWeight.w400, height: 1.55),
      bodySmall:      _dm(12, FontWeight.w400),
      labelLarge:     _dm(14, FontWeight.w600, letterSpacing: 0.1),
      labelMedium:    _dm(12, FontWeight.w500, letterSpacing: 0.3),
      labelSmall:     _dm(11, FontWeight.w600, letterSpacing: 1.2),
    );
  }

  static List<BoxShadow> get shadowSm => const [
    BoxShadow(color: Color(0x0D000000), blurRadius: 4,  offset: Offset(0, 1)),
    BoxShadow(color: Color(0x08000000), blurRadius: 2,  offset: Offset(0, 1)),
  ];
  static List<BoxShadow> get shadowMd => const [
    BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 4)),
    BoxShadow(color: Color(0x08000000), blurRadius: 4,  offset: Offset(0, 2)),
  ];
  static List<BoxShadow> get shadowLg => const [
    BoxShadow(color: Color(0x1A000000), blurRadius: 24, offset: Offset(0, 8)),
    BoxShadow(color: Color(0x0D000000), blurRadius: 8,  offset: Offset(0, 3)),
  ];

  /// Standard card decoration (white surface, zinc border, shadowSm).
  static BoxDecoration card({double radius = 14}) => BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: const Color(0xFFE5E7EB)),
    boxShadow: shadowSm,
  );

  /// Legacy alias kept for backward compat.
  static BoxDecoration cardDecoration({double radius = 14, List<BoxShadow>? shadow}) =>
      BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0xFFE5E7EB), width: 1),
        boxShadow: shadow ?? shadowSm,
      );

  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: DiklyColors.primary,
      brightness: Brightness.light,
      primary: DiklyColors.primary,
      onPrimary: Colors.white,
      secondary: DiklyColors.primaryLight,
      tertiary: const Color(0xFF7C3AED),
      error: DiklyColors.error,
      surface: DiklyColors.surface,
      onSurface: DiklyColors.text,
      surfaceContainerHighest: const Color(0xFFF0F0FF),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      textTheme: _textTheme,
      scaffoldBackgroundColor: const Color(0xFFF4F6F9),

      appBarTheme: AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: DiklyColors.text,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: _dm(17, FontWeight.w700, color: DiklyColors.text),
        iconTheme: const IconThemeData(color: DiklyColors.text, size: 22),
        shape: const Border(bottom: BorderSide(color: Color(0xFFE5E7EB), width: 1)),
      ),

      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: Color(0xFFE5E7EB), width: 1),
        ),
        margin: const EdgeInsets.only(bottom: 12),
      ),

      // Material You FilledButton
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: DiklyColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: _dm(15, FontWeight.w600),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: DiklyColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: _dm(15, FontWeight.w600),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: DiklyColors.primary,
          side: const BorderSide(color: DiklyColors.primary, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: _dm(15, FontWeight.w600),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: DiklyColors.primary,
          textStyle: _dm(14, FontWeight.w600),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFE5E7EB), width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFFE5E7EB), width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: DiklyColors.error, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: DiklyColors.error, width: 2),
        ),
        labelStyle: _dm(14, FontWeight.w500, color: DiklyColors.textSecondary),
        hintStyle: _dm(14, FontWeight.w400, color: DiklyColors.textMuted),
        prefixIconColor: DiklyColors.textMuted,
        suffixIconColor: DiklyColors.textMuted,
      ),

      // Material You NavigationBar
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        indicatorColor: const Color(0xFFEEF2FF),
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        height: 72,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return _dm(11, FontWeight.w700, color: DiklyColors.primary);
          }
          return _dm(11, FontWeight.w400, color: DiklyColors.textMuted);
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: DiklyColors.primary, size: 22);
          }
          return const IconThemeData(color: DiklyColors.textMuted, size: 22);
        }),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFF4F4F5),
        labelStyle: _dm(12, FontWeight.w500, color: DiklyColors.textSecondary),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: const BorderSide(color: Color(0xFFE5E7EB), width: 1),
      ),

      dividerTheme: const DividerThemeData(
        color: Color(0xFFE5E7EB),
        space: 1,
        thickness: 1,
      ),

      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        tileColor: Colors.transparent,
      ),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF18181B),  // zinc-900
        contentTextStyle: _dm(14, FontWeight.w400, color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 8,
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        elevation: 12,
        titleTextStyle: _dm(18, FontWeight.w700, color: DiklyColors.text),
        contentTextStyle: _dm(14, FontWeight.w400, color: DiklyColors.textSecondary),
      ),

      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: DiklyColors.primary,
        foregroundColor: Colors.white,
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),

      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),

      // Legacy BottomNavigationBar (kept for screens not yet migrated)
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: DiklyColors.primary,
        unselectedItemColor: DiklyColors.textLight,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: _dm(11, FontWeight.w700),
        unselectedLabelStyle: _dm(11, FontWeight.w400),
        elevation: 0,
        type: BottomNavigationBarType.fixed,
      ),
    );
  }

  static ThemeData get darkTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: DiklyColors.primary,
      brightness: Brightness.dark,
      primary: DiklyColors.primaryLight,
      onPrimary: Colors.white,
      secondary: DiklyColors.primary,
      error: DiklyColors.error,
      surface: DiklyColors.darkSurface,
      onSurface: Colors.white,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      textTheme: _textTheme.apply(
        bodyColor: const Color(0xFFF0F0FF),
        displayColor: const Color(0xFFF0F0FF),
      ),
      scaffoldBackgroundColor: DiklyColors.darkBackground,
      appBarTheme: AppBarTheme(
        backgroundColor: DiklyColors.darkSurface,
        foregroundColor: Colors.white,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: _dm(17, FontWeight.w700, color: Colors.white),
      ),
      cardTheme: CardThemeData(
        color: DiklyColors.darkSurface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: DiklyColors.darkBorder, width: 1),
        ),
      ),
    );
  }
}
