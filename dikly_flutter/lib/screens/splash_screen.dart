import 'dart:math';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/update_checker.dart';

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
  late Animation<double> _glowPulse;

  // Kick off update check immediately so it runs during the animation.
  late final Future<UpdateInfo?> _updateFuture = UpdateChecker.check();

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );

    _logoFade = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOut),
    );
    _logoScale = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOutBack),
    );
    _subtitleFade = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.45, 0.85, curve: Curves.easeIn),
    );
    _glowPulse = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.6, 1.0, curve: Curves.easeInOut),
    );

    _ctrl.forward();

    Future.delayed(const Duration(milliseconds: 3200), () async {
      if (!mounted) return;
      final update = await _updateFuture;
      if (!mounted) return;
      if (update != null) {
        await _showUpdateDialog(update);
      } else {
        context.go('/portal');
      }
    });
  }

  Future<void> _showUpdateDialog(UpdateInfo update) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0E2440),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.system_update_rounded, color: Color(0xFF00E5FF), size: 22),
            const SizedBox(width: 10),
            Text(
              'Update Available',
              style: GoogleFonts.dmSans(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 17,
              ),
            ),
          ],
        ),
        content: Text(
          'A new version of DIKLY is available.\n\nDownload and install it — your data will be kept.',
          style: GoogleFonts.dmSans(color: Colors.white70, fontSize: 14, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () {
              UpdateChecker.markSeen(update.releaseId);
              Navigator.of(ctx).pop();
            },
            child: Text('Later', style: GoogleFonts.dmSans(color: Colors.white54)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00BCD4),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              UpdateChecker.markSeen(update.releaseId);
              Navigator.of(ctx).pop();
              await launchUrl(
                Uri.parse(update.downloadUrl),
                mode: LaunchMode.externalApplication,
              );
            },
            child: Text('Download Update', style: GoogleFonts.dmSans(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    if (mounted) context.go('/portal');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFF07192E),
      body: Stack(
        children: [
          // ── Tech background ──────────────────────────────────────
          CustomPaint(
            size: size,
            painter: _TechBgPainter(),
          ),

          // ── Animated content ─────────────────────────────────────
          AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) {
              final glow = 20.0 + _glowPulse.value * 20.0;
              return Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // DIKLY wordmark
                      Opacity(
                        opacity: _logoFade.value,
                        child: Transform.scale(
                          scale: 0.75 + _logoScale.value * 0.25,
                          child: ShaderMask(
                            shaderCallback: (bounds) =>
                                const LinearGradient(
                              colors: [
                                Color(0xFF00E5FF),
                                Color(0xFF00BCD4),
                                Color(0xFF80DEEA),
                              ],
                              stops: [0.0, 0.5, 1.0],
                            ).createShader(bounds),
                            child: Text(
                              'DiKLY',
                              style: GoogleFonts.dmSans(
                                fontSize: 82,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                                letterSpacing: 6,
                                height: 1.0,
                                shadows: [
                                  Shadow(
                                      color: const Color(0xFF00E5FF),
                                      blurRadius: glow),
                                  Shadow(
                                      color: const Color(0xFF00B4D8),
                                      blurRadius: glow * 2),
                                  Shadow(
                                      color: const Color(0xFF00E5FF)
                                          .withOpacity(0.4),
                                      blurRadius: glow * 3),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      // Subtitle
                      Opacity(
                        opacity: _subtitleFade.value,
                        child: Text(
                          'Smart Attendance & Education Management',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.dmSans(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                            letterSpacing: 0.3,
                            height: 1.4,
                            shadows: [
                              Shadow(
                                color: Colors.black.withOpacity(0.6),
                                blurRadius: 8,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Paints the dark navy tech background:
/// diagonal streaks · QR pattern · constellation dots · waveform.
class _TechBgPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // ── Background gradient ───────────────────────────────────────
    final bgPaint = Paint()
      ..shader = const RadialGradient(
        center: Alignment(0, -0.2),
        radius: 1.1,
        colors: [Color(0xFF0E2440), Color(0xFF07192E)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    // ── Diagonal streak helper ────────────────────────────────────
    void drawStreak(
        double cx, double cy, double angle, double w, double h, double opacity) {
      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate(angle);
      final paint = Paint()
        ..shader = LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            Colors.transparent,
            const Color(0xFF00BCD4).withOpacity(opacity),
            Colors.transparent,
          ],
        ).createShader(Rect.fromLTWH(-w / 2, -h / 2, w, h));
      canvas.drawRect(Rect.fromLTWH(-w / 2, -h / 2, w, h), paint);
      canvas.restore();
    }

    // Left streak
    drawStreak(
        size.width * 0.1, size.height * 0.35, -0.48,
        size.width * 0.22, size.height * 1.1, 0.30);
    // Right streak
    drawStreak(
        size.width * 0.85, size.height * 0.65, -0.48,
        size.width * 0.18, size.height * 0.9, 0.22);

    // ── QR code pattern (top-right) ───────────────────────────────
    _drawQr(canvas, size);

    // ── Constellation dots (lower half) ───────────────────────────
    _drawConstellation(canvas, size);

    // ── Waveform (bottom) ─────────────────────────────────────────
    _drawWaveform(canvas, size);

    // ── Scattered binary text ─────────────────────────────────────
    _drawBinaryHints(canvas, size);
  }

  void _drawQr(Canvas canvas, Size size) {
    final rng = Random(7);
    const cell = 12.0;
    const cols = 14;
    const rows = 14;
    final left = size.width - cols * cell - 18;
    const top = 18.0;

    final fillPaint = Paint()
      ..color = const Color(0xFF00BCD4).withOpacity(0.18)
      ..style = PaintingStyle.fill;

    for (int r = 0; r < rows; r++) {
      for (int c = 0; c < cols; c++) {
        if (rng.nextBool()) {
          canvas.drawRect(
            Rect.fromLTWH(left + c * cell + 1, top + r * cell + 1, cell - 2, cell - 2),
            fillPaint,
          );
        }
      }
    }

    // Corner finder squares
    final markerStroke = Paint()
      ..color = const Color(0xFF00BCD4).withOpacity(0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final markerFill = Paint()
      ..color = const Color(0xFF00BCD4).withOpacity(0.22)
      ..style = PaintingStyle.fill;

    for (final pos in [
      Offset(left, top),
      Offset(left + (cols - 3) * cell, top),
      Offset(left, top + (rows - 3) * cell),
    ]) {
      canvas.drawRect(Rect.fromLTWH(pos.dx, pos.dy, cell * 3, cell * 3), markerStroke);
      canvas.drawRect(Rect.fromLTWH(pos.dx + cell, pos.dy + cell, cell, cell), markerFill);
    }
  }

  void _drawConstellation(Canvas canvas, Size size) {
    final rng = Random(42);
    final dotPaint = Paint()
      ..color = const Color(0xFF00BCD4).withOpacity(0.55)
      ..style = PaintingStyle.fill;
    final linePaint = Paint()
      ..color = const Color(0xFF00BCD4).withOpacity(0.10)
      ..strokeWidth = 0.7;

    final dots = List.generate(18, (_) => Offset(
      20 + rng.nextDouble() * (size.width - 40),
      size.height * 0.55 + rng.nextDouble() * size.height * 0.42,
    ));

    for (int i = 0; i < dots.length; i++) {
      for (int j = i + 1; j < dots.length; j++) {
        if ((dots[i] - dots[j]).distance < 130) {
          canvas.drawLine(dots[i], dots[j], linePaint);
        }
      }
    }
    for (final d in dots) {
      canvas.drawCircle(d, 2.2, dotPaint);
    }
  }

  void _drawWaveform(Canvas canvas, Size size) {
    final rng = Random(13);
    final paint = Paint()
      ..color = const Color(0xFF00BCD4).withOpacity(0.35)
      ..style = PaintingStyle.fill;

    const barW = 3.0;
    const gap = 1.5;
    final baseY = size.height - 20;
    final count = (size.width / (barW + gap)).floor();

    for (int i = 0; i < count; i++) {
      final h = 4.0 + rng.nextDouble() * 28;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(i * (barW + gap), baseY - h, barW, h),
          const Radius.circular(1),
        ),
        paint,
      );
    }
  }

  void _drawBinaryHints(Canvas canvas, Size size) {
    final rng = Random(99);
    final samples = ['1010', '0011', '1001', '0110', '101', '010', '1100', '0101'];

    for (int i = 0; i < 12; i++) {
      final x = 10.0 + rng.nextDouble() * (size.width - 60);
      final y = 30.0 + rng.nextDouble() * (size.height - 80);
      final label = samples[rng.nextInt(samples.length)];

      final tp = TextPainter(
        text: TextSpan(
          text: label,
          style: TextStyle(
            fontSize: 9,
            color: const Color(0xFF00BCD4).withOpacity(0.12 + rng.nextDouble() * 0.10),
            fontFamily: 'monospace',
            letterSpacing: 1,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x, y));
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
