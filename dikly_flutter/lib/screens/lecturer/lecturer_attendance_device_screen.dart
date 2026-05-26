import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/theme.dart';

class LecturerAttendanceDeviceScreen extends StatefulWidget {
  const LecturerAttendanceDeviceScreen({super.key});

  @override
  State<LecturerAttendanceDeviceScreen> createState() =>
      _LecturerAttendanceDeviceScreenState();
}

class _LecturerAttendanceDeviceScreenState
    extends State<LecturerAttendanceDeviceScreen> {
  void _showPairingSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _PairingBottomSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: const Text(
          'Attendance Device',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Color(0xFF111827),
          ),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Attendance Device',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Your dedicated ESP32 classroom device',
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 24),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.06),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.wifi_tethering,
                    size: 64,
                    color: Color(0xFF9CA3AF),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Connect Your Classroom Device',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF111827),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    "Tap Connect Device and we'll walk you through the setup automatically.",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: Color(0xFF6B7280),
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _showPairingSheet,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3F51B5),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: const Text(
                        '+ Connect Device',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
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
}

class _PairingBottomSheet extends StatefulWidget {
  const _PairingBottomSheet();

  @override
  State<_PairingBottomSheet> createState() => _PairingBottomSheetState();
}

class _PairingBottomSheetState extends State<_PairingBottomSheet> {
  int _secondsLeft = 295; // ~4:55
  Timer? _timer;
  static const String _pairingCode = 'MMYGUW';
  static const Color _indigo = Color(0xFF3F51B5);

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_secondsLeft <= 0) {
        t.cancel();
      } else {
        setState(() => _secondsLeft--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _timerLabel {
    final m = _secondsLeft ~/ 60;
    final s = _secondsLeft % 60;
    return 'Expires in $m:${s.toString().padLeft(2, '0')}';
  }

  Widget _stepCircle(String number) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: _indigo,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Center(
        child: Text(
          number,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE5E7EB),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // ── Step 1: Pairing code ──────────────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _stepCircle('1'),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Get a pairing code',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF111827),
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Tap Generate Code to create a one-time code.',
                        style: TextStyle(
                            fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Center(
              child: Text(
                _pairingCode,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 42,
                  fontWeight: FontWeight.w800,
                  color: _indigo,
                  letterSpacing: 6,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                _timerLabel,
                style: const TextStyle(
                    fontSize: 13, color: Color(0xFF6B7280)),
              ),
            ),
            const SizedBox(height: 6),
            const Center(
              child: Text(
                'Auto-filled in the setup portal — no need to type it',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 12, color: Color(0xFF9CA3AF)),
              ),
            ),
            const SizedBox(height: 20),

            // ── Step 2: WiFi ──────────────────────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _stepCircle('2'),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Connect to the device WiFi',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF111827),
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Power on the ESP32, then join its hotspot',
                        style: TextStyle(
                            fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              '1  Power on the ESP32 device — its LED will blink.',
              style: TextStyle(fontSize: 13, color: Color(0xFF374151)),
            ),
            const SizedBox(height: 6),
            const Text(
              '2  Open WiFi settings on this device and connect to:',
              style: TextStyle(fontSize: 13, color: Color(0xFF374151)),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF1F2937),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.wifi, color: Colors.white, size: 20),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'DIKLY-$_pairingCode',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          fontFamily: 'monospace',
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'No password needed · your internet will pause briefly',
                        style: TextStyle(
                            fontSize: 11, color: Color(0xFF9CA3AF)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '3  Come back here and tap Open Setup Portal. The portal opens with your code already filled in — just enter your classroom WiFi password and tap Pair Device.',
              style: TextStyle(
                  fontSize: 13, color: Color(0xFF374151), height: 1.5),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: () {},
                style: ElevatedButton.styleFrom(
                  backgroundColor: _indigo,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: const Text(
                  'Open Setup Portal →',
                  style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                '⚠ The portal only works while you\'re connected to the DIKLY WiFi.',
                style: TextStyle(
                    fontSize: 13, color: Color(0xFFD97706), height: 1.4),
              ),
            ),
            const SizedBox(height: 20),

            // ── Step 4: Completing ────────────────────────────────────
            Row(
              children: [
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: _indigo,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Completing setup',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF111827),
                        ),
                      ),
                      Text(
                        'Waiting for device to pair...',
                        style: TextStyle(
                            fontSize: 13, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),
            Center(
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF6B7280),
                  side: const BorderSide(color: Color(0xFFD1D5DB)),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                child: const Text('Cancel'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
