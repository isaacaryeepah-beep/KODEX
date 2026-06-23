import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../core/update_checker.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  // Hex prism rocks back and forth — 5.5 s cycle, mirrors hexRock CSS keyframe
  late final AnimationController _rockCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 5500),
  )..repeat(reverse: true);

  // Reveal: hex fades + scales in (0–700 ms), wordmark slides up (750–1400 ms)
  late final AnimationController _revealCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..forward();

  // Particles float continuously
  late final AnimationController _particleCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3000),
  )..repeat();

  late final Animation<double> _hexReveal = CurvedAnimation(
    parent: _revealCtrl,
    curve: const Interval(0.0, 0.5, curve: Curves.easeOutBack),
  );
  late final Animation<double> _wmReveal = CurvedAnimation(
    parent: _revealCtrl,
    curve: const Interval(0.54, 1.0, curve: Curves.easeOut),
  );

  static const _taglines = ['Innovate •', 'Connect •', 'Empower •', 'Educate •', 'Attend •'];
  int _taglineIdx = 0;
  Timer? _taglineTimer;

  late final Future<UpdateInfo?> _updateFuture = UpdateChecker.check();
  double? _downloadProgress;

  // Pre-computed seeded particle layout (same seed each launch)
  late final List<_Particle> _particles = _buildParticles();

  @override
  void initState() {
    super.initState();

    // Cycle taglines every 520 ms (same cadence as web splash)
    _taglineTimer = Timer.periodic(const Duration(milliseconds: 520), (_) {
      if (mounted) setState(() => _taglineIdx = (_taglineIdx + 1) % _taglines.length);
    });

    Future.delayed(const Duration(milliseconds: 3200), () async {
      if (!mounted) return;
      final update = await _updateFuture;
      if (!mounted) return;
      if (update != null) {
        await _downloadAndInstall(update);
      } else {
        context.go('/portal');
      }
    });
  }

  Future<void> _downloadAndInstall(UpdateInfo update) async {
    if (!mounted) return;
    setState(() => _downloadProgress = 0.0);
    try {
      await UpdateChecker.downloadAndInstall(
        update,
        onProgress: (p) {
          if (mounted) setState(() => _downloadProgress = p);
        },
      );
      if (mounted) context.go('/portal');
    } catch (_) {
      if (mounted) context.go('/portal');
    }
  }

  @override
  void dispose() {
    _rockCtrl.dispose();
    _revealCtrl.dispose();
    _particleCtrl.dispose();
    _taglineTimer?.cancel();
    super.dispose();
  }

  static List<_Particle> _buildParticles() {
    final rng = Random(42);
    return List.generate(22, (i) => _Particle(
      left:    rng.nextDouble(),
      top:     rng.nextDouble(),
      size:    1.5 + rng.nextDouble() * 3.0,
      opacity: 0.2  + rng.nextDouble() * 0.5,
      phase:   i / 22.0,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: const Color(0xFF050A14),
      body: Stack(
        children: [
          // Dark gradient background + dot grid
          CustomPaint(size: size, painter: const _BgPainter()),

          // Update-download overlay
          if (_downloadProgress != null)
            Container(
              color: const Color(0xDD050A14),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.system_update_rounded,
                          color: Color(0xFF60A5FA), size: 36),
                      const SizedBox(height: 16),
                      Text('Updating DIKLY…',
                          style: GoogleFonts.dmSans(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: _downloadProgress,
                          backgroundColor: Colors.white12,
                          valueColor: const AlwaysStoppedAnimation(Color(0xFF60A5FA)),
                          minHeight: 6,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('${((_downloadProgress ?? 0) * 100).toInt()}%',
                          style: GoogleFonts.dmSans(
                              color: Colors.white54, fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ),

          // Main animated content
          if (_downloadProgress == null)
            AnimatedBuilder(
              animation: Listenable.merge([_rockCtrl, _revealCtrl, _particleCtrl]),
              builder: (context, _) {
                // Rock: 0→1 (reverse-repeat) maps to CSS 0%→50%
                //   rotateY: -28° → +28°   rotateX: 16° → -12°
                final t   = _rockCtrl.value;
                final rotY = (-28.0 + 56.0 * t) * pi / 180;
                final rotX = (16.0  - 28.0 * t) * pi / 180;

                return Stack(
                  children: [
                    // Floating particles
                    ..._particles.map((p) {
                      final ft = (_particleCtrl.value + p.phase) % 1.0;
                      final dy = sin(ft * 2 * pi) * -22.0;
                      final sc = 1.0 + sin(ft * 2 * pi) * 0.3;
                      final op = (p.opacity * (0.7 + 0.3 * sin(ft * 2 * pi).abs()))
                          .clamp(0.0, 1.0);
                      return Positioned(
                        left: p.left * size.width,
                        top:  p.top  * size.height + dy,
                        child: Opacity(
                          opacity: op,
                          child: Transform.scale(
                            scale: sc,
                            child: Container(
                              width: p.size, height: p.size,
                              decoration: BoxDecoration(
                                // ignore: deprecated_member_use
                                color: const Color(0xFF60A5FA).withOpacity(0.6),
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        ),
                      );
                    }),

                    // Vignette (edge darkening)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(painter: const _VignettePainter()),
                      ),
                    ),

                    // Hex prism + wordmark centred on screen
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // ── 3D hex prism ───────────────────────────
                          Opacity(
                            opacity: _hexReveal.value.clamp(0.0, 1.0),
                            child: Transform.scale(
                              scale: 0.65 + _hexReveal.value * 0.35,
                              child: Transform(
                                alignment: Alignment.center,
                                transform: Matrix4.identity()
                                  ..setEntry(3, 2, 0.002) // perspective
                                  ..rotateY(rotY)
                                  ..rotateX(rotX),
                                child: const SizedBox(
                                  width: 200,
                                  height: 200,
                                  child: CustomPaint(painter: _PrismPainter()),
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 36),

                          // ── Wordmark + subtitle + tagline ──────────
                          Opacity(
                            opacity: _wmReveal.value.clamp(0.0, 1.0),
                            child: Transform.translate(
                              offset: Offset(0, 14.0 * (1.0 - _wmReveal.value)),
                              child: Column(
                                children: [
                                  Text(
                                    'DIKLY',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 38,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 10,
                                      color: Colors.white,
                                      shadows: [
                                        Shadow(
                                          // ignore: deprecated_member_use
                                          color: const Color(0xFF60A5FA).withOpacity(0.5),
                                          blurRadius: 24,
                                        ),
                                        Shadow(
                                          // ignore: deprecated_member_use
                                          color: Colors.black.withOpacity(0.6),
                                          blurRadius: 8,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    'Smart Attendance & Education Platform',
                                    style: GoogleFonts.dmSans(
                                      fontSize: 11,
                                      letterSpacing: 2,
                                      fontWeight: FontWeight.w500,
                                      // ignore: deprecated_member_use
                                      color: const Color(0xFF93C5FD).withOpacity(0.65),
                                    ),
                                  ),
                                  const SizedBox(height: 5),
                                  AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 200),
                                    child: Text(
                                      _taglines[_taglineIdx],
                                      key: ValueKey(_taglineIdx),
                                      style: GoogleFonts.dmSans(
                                        fontSize: 11,
                                        letterSpacing: 2,
                                        // ignore: deprecated_member_use
                                        color: const Color(0xFF93C5FD).withOpacity(0.38),
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
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}

// ── Particle data ─────────────────────────────────────────────────────────────

class _Particle {
  final double left, top, size, opacity, phase;
  const _Particle({
    required this.left,
    required this.top,
    required this.size,
    required this.opacity,
    required this.phase,
  });
}

// ── Background: dark gradient + dot grid ──────────────────────────────────────

class _BgPainter extends CustomPainter {
  const _BgPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);

    canvas.drawRect(rect, Paint()..color = const Color(0xFF050A14));

    // Blue radial glow near centre
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(0, -0.04),
          radius: 0.7,
          colors: [
            // ignore: deprecated_member_use
            const Color(0xFF143CA0).withOpacity(0.35),
            Colors.transparent,
          ],
        ).createShader(rect),
    );

    // Dark-blue glow at bottom
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(0, 1.0),
          radius: 0.8,
          colors: [
            // ignore: deprecated_member_use
            const Color(0xFF0A1946).withOpacity(0.6),
            Colors.transparent,
          ],
        ).createShader(rect),
    );

    // Subtle dot grid (28 px spacing)
    // ignore: deprecated_member_use
    final dot = Paint()..color = const Color(0xFF3B82F6).withOpacity(0.12);
    const sp = 28.0;
    for (double x = 0; x < size.width; x += sp) {
      for (double y = 0; y < size.height; y += sp) {
        canvas.drawCircle(Offset(x, y), 1.0, dot);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ── Hex prism with D icon ─────────────────────────────────────────────────────
//
// Mirrors the CSS 3D hex prism in index.html:
//   clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)
// Layers drawn back → front to simulate depth (hx-aura → hx-b4…b1 → hx-front).
// The 3D rock transform is applied outside this painter via a Matrix4 Transform
// widget, so this painter is fully static (shouldRepaint = false).

class _PrismPainter extends CustomPainter {
  const _PrismPainter();

  // Flat-top hexagon matching the CSS clip-path percentages.
  // r = half the height (= half the width for this hex).
  static Path _hex(double cx, double cy, double r) => Path()
    ..moveTo(cx,     cy - r)
    ..lineTo(cx + r, cy - r * 0.5)
    ..lineTo(cx + r, cy + r * 0.5)
    ..lineTo(cx,     cy + r)
    ..lineTo(cx - r, cy + r * 0.5)
    ..lineTo(cx - r, cy - r * 0.5)
    ..close();

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width  / 2;
    final cy = size.height / 2;

    // ── Aura: blurred glow behind all layers ──────────────────────
    canvas.drawPath(
      _hex(cx, cy, 90),
      Paint()
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14)
        ..shader = RadialGradient(
          colors: [
            // ignore: deprecated_member_use
            const Color(0xFF2563EB).withOpacity(0.55),
            // ignore: deprecated_member_use
            const Color(0xFF0E2878).withOpacity(0.20),
            Colors.transparent,
          ],
          stops: const [0, 0.65, 1.0],
        ).createShader(Rect.fromLTWH(cx - 90, cy - 90, 180, 180)),
    );

    // ── Depth layers: hx-b4 → hx-b1 (back to front) ──────────────
    const layers = [
      (65.0, Color(0xFF0A1A40), Color(0xFF061230)),
      (70.0, Color(0xFF0E2258), Color(0xFF091840)),
      (74.0, Color(0xFF142C72), Color(0xFF0D2060)),
      (77.0, Color(0xFF1A3888), Color(0xFF122876)),
    ];
    for (final (r, c1, c2) in layers) {
      canvas.drawPath(
        _hex(cx, cy, r),
        Paint()
          ..shader = LinearGradient(
            begin: const Alignment(-0.6, -1),
            end:   const Alignment( 0.6,  1),
            colors: [c1, c2],
          ).createShader(Rect.fromLTWH(cx - r, cy - r, r * 2, r * 2)),
      );
    }

    // ── Front face ─────────────────────────────────────────────────
    const fr = 79.0;
    final frontRect = Rect.fromLTWH(cx - fr, cy - fr, fr * 2, fr * 2);

    // Outer glow (two passes: tight + wide)
    for (final (blur, alpha) in [(20.0, 0.55), (40.0, 0.22)]) {
      canvas.drawPath(
        _hex(cx, cy, fr + 4),
        Paint()
          // ignore: deprecated_member_use
          ..color = const Color(0xFF2563EB).withOpacity(alpha)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, blur),
      );
    }

    // Fill
    canvas.drawPath(
      _hex(cx, cy, fr),
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment(-0.7, -1),
          end:   Alignment( 0.7,  1),
          colors: [Color(0xFF2251B8), Color(0xFF1A3EA0), Color(0xFF0C1848)],
          stops: [0, 0.5, 0.8],
        ).createShader(frontRect),
    );

    // Gloss sheen (top-left highlight)
    canvas.save();
    canvas.clipPath(_hex(cx, cy, fr));
    canvas.drawPath(
      _hex(cx, cy, fr),
      Paint()
        ..shader = LinearGradient(
          begin: const Alignment(-1, -1),
          end:   const Alignment( 0, 0.2),
          colors: [
            Colors.white.withOpacity(0.18), // ignore: deprecated_member_use
            Colors.white.withOpacity(0.06), // ignore: deprecated_member_use
            Colors.transparent,
          ],
          stops: const [0, 0.45, 0.7],
        ).createShader(frontRect),
    );
    canvas.restore();

    // ── Dikly "D" icon ─────────────────────────────────────────────
    _drawIcon(canvas, cx, cy, 40);

    // ── Outer glow ring ────────────────────────────────────────────
    canvas.drawPath(
      _hex(cx, cy, 95),
      Paint()
        // ignore: deprecated_member_use
        ..color = const Color(0xFF60A5FA).withOpacity(0.25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    // ── Edge highlight lines ────────────────────────────────────────
    canvas.drawPath(
      _hex(cx, cy, 81),
      Paint()
        // ignore: deprecated_member_use
        ..color = const Color(0xFF60A5FA).withOpacity(0.22)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );
    canvas.drawPath(
      _hex(cx, cy, 77),
      Paint()
        // ignore: deprecated_member_use
        ..color = const Color(0xFF60A5FA).withOpacity(0.10)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8,
    );

    // ── Drop shadow below prism ────────────────────────────────────
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, cy + fr + 14), width: 100, height: 18),
      Paint()
        // ignore: deprecated_member_use
        ..color = const Color(0xFF0A1E64).withOpacity(0.7)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
  }

  // Dikly "D" icon — same SVG as hx-icon in index.html (viewBox 0 0 100 100)
  static void _drawIcon(Canvas canvas, double cx, double cy, double r) {
    final scale = (r * 2) / 100;
    final ox = cx - 50 * scale;
    final oy = cy - 50 * scale;
    double px(double x) => ox + x * scale;
    double py(double y) => oy + y * scale;

    // D outer shape
    final dPath = Path()
      ..moveTo(px(14), py(4))
      ..lineTo(px(14), py(96))
      ..lineTo(px(50), py(96))
      ..cubicTo(px(97), py(93), px(97), py(7), px(50), py(4))
      ..close();

    // Glow behind icon (drawn first)
    canvas.drawPath(dPath, Paint()
      // ignore: deprecated_member_use
      ..color = const Color(0xFF93C5FD).withOpacity(0.85)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));
    canvas.drawPath(dPath, Paint()
      // ignore: deprecated_member_use
      ..color = const Color(0xFF2563EB).withOpacity(0.6)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 26));

    // Gradient fill
    canvas.drawPath(
      dPath,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end:   Alignment.bottomRight,
          colors: const [Color(0xFFBFDBFE), Color(0xFF93C5FD), Color(0xFF60A5FA)],
          stops: const [0, 0.45, 1.0],
        ).createShader(Rect.fromLTWH(px(14), py(4), (50 - 14) * scale, (96 - 4) * scale)),
    );

    // White chevrons clipped to D shape
    canvas.save();
    canvas.clipPath(dPath);

    final white = Paint()..color = Colors.white;

    // Top chevron: SVG polygon points="4,58 63,-2 89,-2 30,58"
    canvas.drawPath(
      Path()
        ..moveTo(px(4),  py(58))
        ..lineTo(px(63), py(-2))
        ..lineTo(px(89), py(-2))
        ..lineTo(px(30), py(58))
        ..close(),
      white,
    );

    // Bottom chevron: SVG polygon points="30,102 89,42 63,42 4,102"
    canvas.drawPath(
      Path()
        ..moveTo(px(30), py(102))
        ..lineTo(px(89), py(42))
        ..lineTo(px(63), py(42))
        ..lineTo(px(4),  py(102))
        ..close(),
      white,
    );

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ── Vignette: dark edges matching web splash ──────────────────────────────────

class _VignettePainter extends CustomPainter {
  const _VignettePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);

    // Radial — transparent centre, dark edges
    canvas.drawRect(rect, Paint()
      ..shader = RadialGradient(
        center: Alignment.center,
        radius: 0.9,
        colors: [
          Colors.transparent,
          // ignore: deprecated_member_use
          const Color(0xFF050A14).withOpacity(0.8),
        ],
        stops: const [0.4, 1.0],
      ).createShader(rect));

    // Bottom fade
    canvas.drawRect(rect, Paint()
      ..shader = LinearGradient(
        begin: Alignment.bottomCenter,
        end:   Alignment.topCenter,
        colors: [
          // ignore: deprecated_member_use
          const Color(0xFF050A14).withOpacity(0.9),
          Colors.transparent,
        ],
        stops: const [0, 0.22],
      ).createShader(rect));

    // Top fade
    canvas.drawRect(rect, Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end:   Alignment.bottomCenter,
        colors: [
          // ignore: deprecated_member_use
          const Color(0xFF050A14).withOpacity(0.8),
          Colors.transparent,
        ],
        stops: const [0, 0.18],
      ).createShader(rect));
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
