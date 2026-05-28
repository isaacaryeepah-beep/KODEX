import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class DiklyColors {
  // Primary — indigo (Material You seed)
  static const Color primary       = Color(0xFF6366F1);
  static const Color primaryDark   = Color(0xFF4F46E5);
  static const Color primaryLight  = Color(0xFF818CF8);
  static const Color primaryULight = Color(0xFFEEF2FF);

  // Semantic
  static const Color success       = Color(0xFF10B981);
  static const Color successLight  = Color(0xFFD1FAE5);
  static const Color warning       = Color(0xFFF59E0B);
  static const Color warningLight  = Color(0xFFFEF3C7);
  static const Color error         = Color(0xFFEF4444);
  static const Color errorLight    = Color(0xFFFEE2E2);
  static const Color info          = Color(0xFF3B82F6);
  static const Color infoLight     = Color(0xFFDBEAFE);

  // Surface / BG
  static const Color background    = Color(0xFFF5F5FF);
  static const Color surface       = Color(0xFFFFFFFF);
  static const Color surfaceHover  = Color(0xFFFAFAFF);
  static const Color authBg        = Color(0xFF0F0F23);

  // Text
  static const Color text          = Color(0xFF0D0D1A);
  static const Color textSecondary = Color(0xFF374151);
  static const Color textLight     = Color(0xFF6B7280);
  static const Color textMuted     = Color(0xFF9CA3AF);

  // Border
  static const Color border        = Color(0xFFE5E7EB);
  static const Color borderLight   = Color(0xFFF3F4F6);

  // Grays
  static const Color grey50  = Color(0xFFF9FAFB);
  static const Color grey100 = Color(0xFFF3F4F6);
  static const Color grey200 = Color(0xFFE5E7EB);
  static const Color grey300 = Color(0xFFD1D5DB);
  static const Color grey400 = Color(0xFF9CA3AF);
  static const Color grey500 = Color(0xFF6B7280);
  static const Color grey600 = Color(0xFF4B5563);
  static const Color grey700 = Color(0xFF374151);
  static const Color grey800 = Color(0xFF1F2937);
  static const Color grey900 = Color(0xFF111827);

  // Dark
  static const Color darkBackground = Color(0xFF0F0F23);
  static const Color darkSurface    = Color(0xFF1A1A35);
  static const Color darkBorder     = Color(0xFF2D2D4E);

  // Sidebar
  static const Color sidebarBg     = Color(0xFF1E1B4B);
  static const Color sidebarText   = Color(0xFF94A3B8);
  static const Color sidebarActive = Color(0xFF6366F1);

  // Gradient presets
  static const List<Color> gradientPrimary  = [Color(0xFF6366F1), Color(0xFF4F46E5)];
  static const List<Color> gradientPurple   = [Color(0xFF7C3AED), Color(0xFF6366F1)];
  static const List<Color> gradientGreen    = [Color(0xFF10B981), Color(0xFF059669)];
  static const List<Color> gradientAmber    = [Color(0xFFF59E0B), Color(0xFFD97706)];
  static const List<Color> gradientRose     = [Color(0xFFF43F5E), Color(0xFFE11D48)];
  static const List<Color> gradientCyan     = [Color(0xFF06B6D4), Color(0xFF0891B2)];
  static const List<Color> gradientNavy     = [Color(0xFF1E1B4B), Color(0xFF0F0F23)];

  // Compat aliases
  static const Color textPrimary = text;
  static const Color cardShadow  = Color(0x0F000000);
  static const Color primaryDarkAlt = Color(0xFF1D4ED8);
  static const Color successDark = Color(0xFF059669);
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

  static List<BoxShadow> get shadowSm => [
    const BoxShadow(color: Color(0x0D6366F1), blurRadius: 4, offset: Offset(0, 2)),
  ];
  static List<BoxShadow> get shadowMd => [
    const BoxShadow(color: Color(0x146366F1), blurRadius: 12, offset: Offset(0, 4)),
    const BoxShadow(color: Color(0x0A000000), blurRadius: 3,  offset: Offset(0, 1)),
  ];
  static List<BoxShadow> get shadowLg => [
    const BoxShadow(color: Color(0x1A6366F1), blurRadius: 24, offset: Offset(0, 8)),
    const BoxShadow(color: Color(0x0A000000), blurRadius: 8,  offset: Offset(0, 3)),
  ];

  static BoxDecoration cardDecoration({double radius = 20, List<BoxShadow>? shadow}) =>
      BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: const Color(0xFFEEEEFF), width: 1),
        boxShadow: shadow ?? shadowMd,
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
      scaffoldBackgroundColor: DiklyColors.background,

      appBarTheme: AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: DiklyColors.text,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: _dm(17, FontWeight.w700, color: DiklyColors.text),
        iconTheme: const IconThemeData(color: DiklyColors.text, size: 22),
        shape: const Border(bottom: BorderSide(color: Color(0xFFEEEEFF), width: 1)),
      ),

      cardTheme: CardThemeData(
        color: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xFFEEEEFF), width: 1),
        ),
        margin: const EdgeInsets.only(bottom: 12),
      ),

      // Material You FilledButton
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: DiklyColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: _dm(15, FontWeight.w600),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: DiklyColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: _dm(15, FontWeight.w600),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: DiklyColors.primary,
          side: const BorderSide(color: DiklyColors.primary, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
        fillColor: const Color(0xFFF8F8FF),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFDDDDFF), width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFDDDDFF), width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: DiklyColors.error, width: 1.5),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: DiklyColors.error, width: 2),
        ),
        labelStyle: _dm(14, FontWeight.w500, color: DiklyColors.textSecondary),
        hintStyle: _dm(14, FontWeight.w400, color: DiklyColors.textMuted),
        prefixIconColor: DiklyColors.primary,
        suffixIconColor: DiklyColors.textLight,
      ),

      // Material You NavigationBar
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        indicatorColor: DiklyColors.primary.withOpacity(0.12),
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        height: 72,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return _dm(11, FontWeight.w700, color: DiklyColors.primary);
          }
          return _dm(11, FontWeight.w400, color: DiklyColors.textLight);
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: DiklyColors.primary, size: 22);
          }
          return const IconThemeData(color: DiklyColors.textLight, size: 22);
        }),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFFF0F0FF),
        labelStyle: _dm(12, FontWeight.w500, color: DiklyColors.primary),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: const BorderSide(color: Color(0xFFDDDDFF), width: 1),
      ),

      dividerTheme: const DividerThemeData(
        color: Color(0xFFEEEEFF),
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
        backgroundColor: DiklyColors.darkSurface,
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
