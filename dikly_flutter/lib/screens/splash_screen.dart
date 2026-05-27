import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _logoFade;
  late Animation<double> _logoScale;
  late Animation<double> _subtitleFade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    _logoFade = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.6, curve: Curves.easeOut),
    );
    _logoScale = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.6, curve: Curves.easeOutBack),
    );
    _subtitleFade = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.5, 1.0, curve: Curves.easeIn),
    );

    _ctrl.forward();

    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) context.go('/portal');
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FB),
      body: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Logo block: gradient rounded square + "DIKLY" text
              Opacity(
                opacity: _logoFade.value,
                child: Transform.scale(
                  scale: 0.85 + (_logoScale.value * 0.15),
                  child: Column(
                    children: [
                      // Gradient "D" icon square
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
                          ),
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF2563EB).withOpacity(0.30),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Text(
                            'D',
                            style: GoogleFonts.dmSans(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1.0,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      // "DIKLY" wordmark
                      Text(
                        'DIKLY',
                        style: GoogleFonts.dmSans(
                          fontSize: 48,
                          fontWeight: FontWeight.w800,
                          color: const Color(0xFF1E1B4B),
                          letterSpacing: 6,
                          height: 1.0,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Tagline
              Opacity(
                opacity: _subtitleFade.value,
                child: Text(
                  'INNOVATE · CONNECT · EMPOWER',
                  style: GoogleFonts.dmSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: const Color(0xFF6366F1),
                    letterSpacing: 3,
                  ),
                ),
              ),
              const SizedBox(height: 48),
              // Progress indicator
              Opacity(
                opacity: _subtitleFade.value,
                child: const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
