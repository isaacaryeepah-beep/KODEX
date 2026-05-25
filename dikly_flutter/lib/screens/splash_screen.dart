import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeIn;
  late Animation<double> _glow;
  late Animation<double> _subtitleFade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 2000));
    _fadeIn       = CurvedAnimation(parent: _controller, curve: const Interval(0.0, 0.5, curve: Curves.easeIn));
    _glow         = CurvedAnimation(parent: _controller, curve: const Interval(0.3, 0.8, curve: Curves.easeInOut));
    _subtitleFade = CurvedAnimation(parent: _controller, curve: const Interval(0.5, 1.0, curve: Curves.easeIn));
    _controller.forward();
    Future.delayed(const Duration(milliseconds: 2800), () {
      if (mounted) context.go('/portal');
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080F20),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF080F20), Color(0xFF0D2240), Color(0xFF080F20)],
            stops: [0.0, 0.5, 1.0],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Glow effect behind logo
              AnimatedBuilder(
                animation: _controller,
                builder: (_, __) => Opacity(
                  opacity: _fadeIn.value,
                  child: Column(
                    children: [
                      // DIKLY logo text with neon glow
                      AnimatedBuilder(
                        animation: _glow,
                        builder: (_, __) => Container(
                          decoration: BoxDecoration(
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF00D4FF).withOpacity(0.3 * _glow.value),
                                blurRadius: 40,
                                spreadRadius: 10,
                              ),
                            ],
                          ),
                          child: Text(
                            'DiKLY',
                            style: TextStyle(
                              fontSize: 72,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 6,
                              foreground: Paint()
                                ..style = PaintingStyle.fill
                                ..color = const Color(0xFF00D4FF),
                              shadows: [
                                Shadow(
                                  color: const Color(0xFF00D4FF).withOpacity(0.8 * _glow.value),
                                  blurRadius: 20,
                                ),
                                Shadow(
                                  color: const Color(0xFF00FFFF).withOpacity(0.4 * _glow.value),
                                  blurRadius: 40,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      // Divider line
                      Opacity(
                        opacity: _subtitleFade.value,
                        child: Container(
                          width: 200,
                          height: 1,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [
                              Colors.transparent,
                              const Color(0xFF00D4FF).withOpacity(0.7),
                              Colors.transparent,
                            ]),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Subtitle
                      Opacity(
                        opacity: _subtitleFade.value,
                        child: const Text(
                          'Smart Attendance & Education Management',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w400,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
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
