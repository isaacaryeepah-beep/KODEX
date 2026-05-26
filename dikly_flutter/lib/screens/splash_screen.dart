import 'dart:math';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _bgFade;
  late Animation<double> _logoScale;
  late Animation<double> _logoGlow;
  late Animation<double> _subtitleFade;
  late Animation<double> _subtitleSlide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400));
    _bgFade       = CurvedAnimation(parent: _ctrl, curve: const Interval(0.0, 0.4, curve: Curves.easeIn));
    _logoScale    = CurvedAnimation(parent: _ctrl, curve: const Interval(0.2, 0.6, curve: Curves.elasticOut));
    _logoGlow     = CurvedAnimation(parent: _ctrl, curve: const Interval(0.4, 1.0, curve: Curves.easeInOut));
    _subtitleFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.6, 1.0, curve: Curves.easeIn));
    _subtitleSlide= CurvedAnimation(parent: _ctrl, curve: const Interval(0.6, 1.0, curve: Curves.easeOut));
    _ctrl.forward();
    Future.delayed(const Duration(milliseconds: 3200), () {
      if (mounted) context.go('/portal');
    });
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Scaffold(
      backgroundColor: const Color(0xFF060D1A),
      body: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) => Stack(
          children: [
            Opacity(
              opacity: _bgFade.value,
              child: CustomPaint(size: size, painter: _BackgroundPainter()),
            ),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Transform.scale(
                    scale: 0.6 + (_logoScale.value * 0.4),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Container(
                          width: 320, height: 120,
                          decoration: BoxDecoration(
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF00D4FF).withOpacity(0.28 * _logoGlow.value),
                                blurRadius: 90, spreadRadius: 20,
                              ),
                            ],
                          ),
                        ),
                        if (_logoGlow.value > 0.4)
                          Positioned(
                            top: 4, left: 100,
                            child: Opacity(
                              opacity: ((_logoGlow.value - 0.4) / 0.6).clamp(0.0, 1.0),
                              child: CustomPaint(size: const Size(70, 70), painter: _LensFlarePainter()),
                            ),
                          ),
                        ShaderMask(
                          shaderCallback: (b) => const LinearGradient(
                            colors: [Color(0xFFAAFFFF), Color(0xFF00D4FF), Color(0xFF00FFEF)],
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                          ).createShader(b),
                          child: Text(
                            'DIKLY',
                            style: TextStyle(
                              fontSize: 88,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 14,
                              color: Colors.white,
                              shadows: [
                                Shadow(color: const Color(0xFF00D4FF).withOpacity(_logoGlow.value), blurRadius: 32),
                                Shadow(color: const Color(0xFF00FFFF).withOpacity(_logoGlow.value * 0.5), blurRadius: 64),
                                Shadow(color: const Color(0xFF00FFFF).withOpacity(_logoGlow.value * 0.3), blurRadius: 96),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),
                  Opacity(
                    opacity: _subtitleFade.value,
                    child: Transform.translate(
                      offset: Offset(0, 18 * (1 - _subtitleSlide.value)),
                      child: Column(
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _dot(),
                              _line(40),
                              const SizedBox(width: 10),
                              const Icon(Icons.calendar_month_outlined, color: Color(0xFF00D4FF), size: 14),
                              const SizedBox(width: 6),
                              const Icon(Icons.people_alt_outlined, color: Color(0xFF00D4FF), size: 14),
                              const SizedBox(width: 6),
                              const Icon(Icons.verified_outlined, color: Color(0xFF00D4FF), size: 14),
                              const SizedBox(width: 10),
                              _line(40),
                              _dot(),
                            ],
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Smart Attendance & Education Management',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 0.4,
                              height: 1.4,
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
        ),
      ),
    );
  }

  Widget _dot() => Container(
    width: 5, height: 5,
    decoration: const BoxDecoration(color: Color(0xFF00D4FF), shape: BoxShape.circle),
  );
  Widget _line(double w) => Container(
    width: w, height: 1,
    color: const Color(0xFF00D4FF).withOpacity(0.6),
  );
}

class _BackgroundPainter extends CustomPainter {
  static final _rng = Random(42);
  static final List<Offset> _nodes = List.generate(20, (i) =>
      Offset(_rng.nextDouble(), _rng.nextDouble()));

  @override
  void paint(Canvas canvas, Size size) {
    // Base gradient
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Paint()..shader = const LinearGradient(
        begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [Color(0xFF060D1A), Color(0xFF0A1830), Color(0xFF071520)],
        stops: [0.0, 0.5, 1.0],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );

    _drawBeams(canvas, size);
    _drawParticleNetwork(canvas, size);
    _drawQR(canvas, size);
    _drawSoundWave(canvas, size);
    _drawFloatingText(canvas, size);
  }

  void _drawBeams(Canvas canvas, Size size) {
    // Left top-to-bottom teal beam
    final p1 = Path()
      ..moveTo(-size.width * 0.05, 0)
      ..lineTo(size.width * 0.42, 0)
      ..lineTo(size.width * 0.22, size.height)
      ..lineTo(-size.width * 0.28, size.height)
      ..close();
    canvas.drawPath(p1, Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [const Color(0xFF00C8A0).withOpacity(0.38), const Color(0xFF00C8A0).withOpacity(0.08)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)));

    // Right bottom beam
    final p2 = Path()
      ..moveTo(size.width * 0.55, size.height)
      ..lineTo(size.width * 1.1, size.height * 0.55)
      ..lineTo(size.width * 1.1, size.height * 1.05)
      ..close();
    canvas.drawPath(p2, Paint()
      ..shader = LinearGradient(
        begin: Alignment.topRight, end: Alignment.bottomLeft,
        colors: [const Color(0xFF00B890).withOpacity(0.35), const Color(0xFF00B890).withOpacity(0.0)],
      ).createShader(Rect.fromLTWH(0, size.height * 0.5, size.width, size.height * 0.5)));
  }

  void _drawParticleNetwork(Canvas canvas, Size size) {
    final line = Paint()
      ..color = const Color(0xFF00D4FF).withOpacity(0.12)
      ..strokeWidth = 0.7
      ..style = PaintingStyle.stroke;
    final dot = Paint()..color = const Color(0xFF00D4FF).withOpacity(0.65);
    final glow = Paint()..color = const Color(0xFF00D4FF).withOpacity(0.10);

    final pts = _nodes.map((n) => Offset(n.dx * size.width, n.dy * size.height)).toList();

    for (int i = 0; i < pts.length; i++) {
      for (int j = i + 1; j < pts.length; j++) {
        if ((pts[i] - pts[j]).distance < size.width * 0.33)
          canvas.drawLine(pts[i], pts[j], line);
      }
    }
    for (int i = 0; i < pts.length; i++) {
      final r = i % 4 == 0 ? 4.5 : 2.0;
      if (i % 4 == 0) canvas.drawCircle(pts[i], r + 6, glow);
      canvas.drawCircle(pts[i], r, dot);
    }
  }

  void _drawQR(Canvas canvas, Size size) {
    final cell = size.width * 0.026;
    final qw = cell * 9;
    final ox = size.width - qw - size.width * 0.04;
    final oy = size.height * 0.025;

    final fill = Paint()..color = const Color(0xFF1A3A55).withOpacity(0.85);
    final border = Paint()
      ..color = const Color(0xFF00D4FF).withOpacity(0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8;

    const grid = [
      [1,1,1,1,1,1,1,0,1],
      [1,0,0,0,0,0,1,0,0],
      [1,0,1,1,1,0,1,0,1],
      [1,0,1,1,1,0,1,0,1],
      [1,0,1,1,1,0,1,0,0],
      [1,0,0,0,0,0,1,0,1],
      [1,1,1,1,1,1,1,0,0],
      [0,0,1,0,0,1,0,0,1],
      [1,0,0,1,1,0,1,1,0],
    ];

    for (int r = 0; r < grid.length; r++) {
      for (int c = 0; c < grid[r].length; c++) {
        if (grid[r][c] == 1) {
          final rect = RRect.fromRectAndRadius(
            Rect.fromLTWH(ox + c * cell + 0.5, oy + r * cell + 0.5, cell - 1, cell - 1),
            const Radius.circular(1.5),
          );
          canvas.drawRRect(rect, fill);
          canvas.drawRRect(rect, border);
        }
      }
    }

    // Outer frame
    canvas.drawRect(
      Rect.fromLTWH(ox - 3, oy - 3, qw + 6, qw + 6),
      Paint()
        ..color = const Color(0xFF00D4FF).withOpacity(0.18)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );
    // Second outer frame (ghost)
    canvas.drawRect(
      Rect.fromLTWH(ox - 10, oy - 10, qw + 20, qw + 20),
      Paint()
        ..color = const Color(0xFF00D4FF).withOpacity(0.07)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  void _drawSoundWave(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF00D4FF).withOpacity(0.45)
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round;

    final baseY = size.height * 0.95;
    final rng = Random(7);
    final count = (size.width / 5.5).floor();

    for (int i = 0; i < count; i++) {
      final x = i * 5.5 + 2.5;
      final raw = rng.nextDouble();
      final center = 1 - ((i / count - 0.5).abs() * 2.2).clamp(0.0, 1.0);
      final h = (raw * 0.35 + center * 0.65) * size.height * 0.07;
      canvas.drawLine(Offset(x, baseY - h), Offset(x, baseY + h * 0.25), paint);
    }
  }

  void _drawFloatingText(Canvas canvas, Size size) {
    final style = TextStyle(
      color: const Color(0xFF00D4FF).withOpacity(0.13),
      fontSize: 8.5,
    );
    final items = [
      ('1010', Offset(size.width * 0.72, size.height * 0.30)),
      ('IOT-23', Offset(size.width * 0.04, size.height * 0.16)),
      ('100 100', Offset(size.width * 0.73, size.height * 0.52)),
      ('10 23', Offset(size.width * 0.62, size.height * 0.14)),
      ('01 23', Offset(size.width * 0.02, size.height * 0.07)),
      ('TAX-33', Offset(size.width * 0.55, size.height * 0.44)),
    ];
    for (final item in items) {
      final tp = TextPainter(
        text: TextSpan(text: item.$1, style: style),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, item.$2);
    }
  }

  @override
  bool shouldRepaint(_BackgroundPainter old) => false;
}

class _LensFlarePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2, cy = size.height / 2;
    canvas.drawCircle(Offset(cx, cy), 5, Paint()..color = Colors.white.withOpacity(0.95));
    canvas.drawCircle(Offset(cx, cy), 14, Paint()..color = Colors.white.withOpacity(0.12));

    final angles = List.generate(8, (i) => i * pi / 4);
    final lengths = [32.0, 14.0, 24.0, 10.0, 30.0, 12.0, 20.0, 9.0];
    for (int i = 0; i < angles.length; i++) {
      canvas.drawLine(
        Offset(cx, cy),
        Offset(cx + cos(angles[i]) * lengths[i], cy + sin(angles[i]) * lengths[i]),
        Paint()
          ..color = Colors.white.withOpacity(0.6)
          ..strokeWidth = 1.2
          ..strokeCap = StrokeCap.round,
      );
    }
    // Color prism streaks
    canvas.drawLine(Offset(cx, cy), Offset(cx + 18, cy - 28),
        Paint()..color = Colors.purpleAccent.withOpacity(0.5)..strokeWidth = 2);
    canvas.drawLine(Offset(cx, cy), Offset(cx + 22, cy - 20),
        Paint()..color = Colors.orangeAccent.withOpacity(0.4)..strokeWidth = 1.5);
  }

  @override
  bool shouldRepaint(_LensFlarePainter old) => false;
}
