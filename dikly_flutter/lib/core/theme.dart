import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class DiklyColors {
  // Primary
  static const Color primary        = Color(0xFF2563EB);
  static const Color primaryDark    = Color(0xFF1D4ED8);
  static const Color primaryLight   = Color(0xFF3B82F6);
  static const Color primaryULight  = Color(0xFFEFF6FF);

  // Semantic
  static const Color success        = Color(0xFF16A34A);
  static const Color successLight   = Color(0xFFDCFCE7);
  static const Color warning        = Color(0xFFD97706);
  static const Color warningLight   = Color(0xFFFEF9C3);
  static const Color error          = Color(0xFFDC2626);
  static const Color errorLight     = Color(0xFFFEE2E2);
  static const Color info           = Color(0xFF2563EB);
  static const Color infoLight      = Color(0xFFDBEAFE);

  // Surface / BG
  static const Color background     = Color(0xFFF4F6F9);
  static const Color surface        = Color(0xFFFFFFFF);
  static const Color surfaceHover   = Color(0xFFFAFBFC);
  static const Color authBg         = Color(0xFFF8F9FB);

  // Text
  static const Color text           = Color(0xFF0D1117);
  static const Color textSecondary  = Color(0xFF374151);
  static const Color textLight      = Color(0xFF6B7280);
  static const Color textMuted      = Color(0xFF9CA3AF);

  // Border
  static const Color border         = Color(0xFFE5E7EB);
  static const Color borderLight    = Color(0xFFF3F4F6);

  // Gray scale
  static const Color grey50         = Color(0xFFF9FAFB);
  static const Color grey100        = Color(0xFFF3F4F6);
  static const Color grey200        = Color(0xFFE5E7EB);
  static const Color grey300        = Color(0xFFD1D5DB);
  static const Color grey400        = Color(0xFF9CA3AF);
  static const Color grey500        = Color(0xFF6B7280);
  static const Color grey600        = Color(0xFF4B5563);
  static const Color grey700        = Color(0xFF374151);
  static const Color grey800        = Color(0xFF1F2937);
  static const Color grey900        = Color(0xFF111827);

  // Dark mode
  static const Color darkBackground = Color(0xFF111827);
  static const Color darkSurface    = Color(0xFF1F2937);
  static const Color darkBorder     = Color(0xFF2D3F52);

  // Sidebar
  static const Color sidebarBg     = Color(0xFF1E293B);
  static const Color sidebarText   = Color(0xFF94A3B8);
  static const Color sidebarActive = Color(0xFF2563EB);

  // Compat aliases
  static const Color textPrimary = text;
  static const Color cardShadow  = Color(0x0F000000);
}

class AppTheme {
  static TextStyle _dm(double size, FontWeight weight, {Color? color, double? letterSpacing, double? height}) =>
    GoogleFonts.dmSans(fontSize: size, fontWeight: weight, color: color, letterSpacing: letterSpacing, height: height);

  static TextTheme get _textTheme {
    return const TextTheme().copyWith(
      displayLarge:  _dm(32, FontWeight.w700, letterSpacing: -0.5),
      displayMedium: _dm(28, FontWeight.w700, letterSpacing: -0.3),
      displaySmall:  _dm(24, FontWeight.w600),
      headlineLarge: _dm(22, FontWeight.w700),
      headlineMedium:_dm(20, FontWeight.w600),
      headlineSmall: _dm(18, FontWeight.w600),
      titleLarge:    _dm(16, FontWeight.w600),
      titleMedium:   _dm(15, FontWeight.w500),
      titleSmall:    _dm(14, FontWeight.w500),
      bodyLarge:     _dm(16, FontWeight.w400, height: 1.55),
      bodyMedium:    _dm(14, FontWeight.w400, height: 1.55),
      bodySmall:     _dm(12, FontWeight.w400),
      labelLarge:    _dm(14, FontWeight.w600, letterSpacing: 0.1),
      labelMedium:   _dm(12, FontWeight.w500, letterSpacing: 0.3),
      labelSmall:    _dm(11, FontWeight.w600, letterSpacing: 1.5),
    );
  }

  // Reusable shadow decorations matching website
  static List<BoxShadow> get shadowSm => [
    const BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1)),
  ];
  static List<BoxShadow> get shadowMd => [
    const BoxShadow(color: Color(0x12000000), blurRadius: 8, offset: Offset(0, 2)),
    const BoxShadow(color: Color(0x0A000000), blurRadius: 2, offset: Offset(0, 1)),
  ];
  static List<BoxShadow> get shadowLg => [
    const BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
    const BoxShadow(color: Color(0x0A000000), blurRadius: 6, offset: Offset(0, 2)),
  ];

  // Card decoration matching website card style
  static BoxDecoration cardDecoration({double radius = 10, List<BoxShadow>? shadow}) => BoxDecoration(
    color: DiklyColors.surface,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: DiklyColors.border, width: 1),
    boxShadow: shadow ?? shadowMd,
  );

  static ThemeData get lightTheme {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: DiklyColors.primary,
      brightness: Brightness.light,
      primary: DiklyColors.primary,
      onPrimary: Colors.white,
      secondary: DiklyColors.primaryLight,
      error: DiklyColors.error,
      surface: DiklyColors.surface,
      onSurface: DiklyColors.text,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      textTheme: _textTheme,
      scaffoldBackgroundColor: DiklyColors.background,
      appBarTheme: AppBarTheme(
        backgroundColor: DiklyColors.surface,
        foregroundColor: DiklyColors.text,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: _dm(17, FontWeight.w700, color: DiklyColors.text),
        iconTheme: const IconThemeData(color: DiklyColors.text, size: 22),
      ),
      cardTheme: CardThemeData(
        color: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: const BorderSide(color: DiklyColors.border, width: 1),
        ),
        margin: const EdgeInsets.only(bottom: 12),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: DiklyColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: _dm(14, FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: DiklyColors.grey700,
          side: const BorderSide(color: DiklyColors.grey300, width: 1),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: _dm(14, FontWeight.w600),
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
        fillColor: DiklyColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: DiklyColors.grey300, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: DiklyColors.grey300, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: DiklyColors.error, width: 1),
        ),
        labelStyle: _dm(14, FontWeight.w500, color: DiklyColors.grey700),
        hintStyle: _dm(14, FontWeight.w400, color: DiklyColors.textMuted),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: DiklyColors.grey100,
        labelStyle: _dm(12, FontWeight.w500, color: DiklyColors.grey700),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: BorderSide.none,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: DiklyColors.surface,
        selectedItemColor: DiklyColors.primary,
        unselectedItemColor: DiklyColors.textLight,
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: _dm(11, FontWeight.w600),
        unselectedLabelStyle: _dm(11, FontWeight.w400),
        elevation: 8,
        type: BottomNavigationBarType.fixed,
      ),
      dividerTheme: const DividerThemeData(
        color: DiklyColors.border,
        space: 1,
        thickness: 1,
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        contentTextStyle: _dm(14, FontWeight.w400),
      ),
      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        elevation: 8,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: DiklyColors.primary,
        foregroundColor: Colors.white,
        elevation: 4,
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
      textTheme: _textTheme.apply(bodyColor: const Color(0xFFF0F4F8), displayColor: const Color(0xFFF0F4F8)),
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: const BorderSide(color: DiklyColors.darkBorder, width: 1),
        ),
      ),
    );
  }
}
