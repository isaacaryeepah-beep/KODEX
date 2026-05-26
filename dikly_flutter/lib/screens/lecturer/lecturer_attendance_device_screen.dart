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
  bool _isPaired = false;

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
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              'Attendance Device',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            Text(
              'Your dedicated ESP32 classroom device',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w400,
                color: DiklyColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (!_isPaired) _UnpairedCard(onConnect: _showPairingSheet),
          if (_isPaired) _PairedCard(),
        ],
      ),
    );
  }
}

class _UnpairedCard extends StatelessWidget {
  final VoidCallback onConnect;
  const _UnpairedCard({required this.onConnect});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(
              Icons.sensors,
              color: Color(0xFF3F51B5),
              size: 38,
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Connect Your Classroom Device',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: DiklyColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Tap Connect Device and we\'ll walk you through the setup automatically.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: DiklyColors.textSecondary,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onConnect,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 18),
              label: const Text(
                'Connect Device',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PairedCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFDCFCE7),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.sensors, color: Color(0xFF16A34A), size: 24),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ESP32 Device Paired',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                    Text(
                      'DIKLY-MMYGUW · Online',
                      style: TextStyle(fontSize: 12, color: Color(0xFF16A34A)),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFDCFCE7),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'ACTIVE',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF16A34A),
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
        ],
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
  int _step = 1; // 1 = code, 2 = wifi, 3 = portal, 4 = completing
  int _secondsLeft = 300; // 5:00
  Timer? _timer;
  static const String _pairingCode = 'MMYGUW';

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
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
    return 'Expires in ${m.toString().padLeft(1, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
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
                  color: DiklyColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            // Step indicator
            Row(
              children: List.generate(4, (i) {
                final active = i + 1 == _step;
                final done = i + 1 < _step;
                return Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    height: 4,
                    decoration: BoxDecoration(
                      color: done || active
                          ? const Color(0xFF1A237E)
                          : DiklyColors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),
            // Step content
            if (_step == 1) _buildStep1(),
            if (_step == 2) _buildStep2(),
            if (_step == 3) _buildStep3(),
            if (_step == 4) _buildStep4(),
            const SizedBox(height: 20),
            // Navigation buttons
            if (_step < 4) ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => setState(() => _step++),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1A237E),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  child: Text(
                    _step == 1
                        ? 'Next — Connect to WiFi'
                        : _step == 2
                            ? 'Next — Open Setup Portal'
                            : 'I\'ve Opened the Portal',
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: DiklyColors.textSecondary),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Text(
          'Step 1 — Your Pairing Code',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: DiklyColors.textPrimary,
          ),
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
          decoration: BoxDecoration(
            color: const Color(0xFFEEF2FF),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Text(
            _pairingCode,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 40,
              fontWeight: FontWeight.w900,
              color: Color(0xFF1A237E),
              letterSpacing: 8,
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.timer_outlined, size: 14, color: DiklyColors.textSecondary),
            const SizedBox(width: 4),
            Text(
              _timerLabel,
              style: const TextStyle(
                fontSize: 13,
                color: DiklyColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        const Text(
          'Auto-filled in the setup portal — no need to type it',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: DiklyColors.textSecondary,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _buildStep2() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Step 2 — Connect to Device WiFi',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: DiklyColors.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'On your phone or tablet, go to WiFi Settings and connect to:',
          style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary, height: 1.5),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.wifi, color: Colors.white, size: 18),
              const SizedBox(width: 10),
              Text(
                'DIKLY-$_pairingCode',
                style: const TextStyle(
                  color: Colors.white,
                  fontFamily: 'monospace',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'The device broadcasts this WiFi when in pairing mode. No password needed.',
          style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary, height: 1.4),
        ),
      ],
    );
  }

  Widget _buildStep3() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Step 3 — Open Setup Portal',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: DiklyColors.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1A237E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
            icon: const Icon(Icons.open_in_browser_outlined, size: 18),
            label: const Text(
              'Open Setup Portal →',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFFEF9C3),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFFBBF24)),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('⚠', style: TextStyle(fontSize: 16)),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'The portal only works while you\'re connected to the DIKLY WiFi.',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFF92400E),
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStep4() {
    return Column(
      children: [
        const SizedBox(height: 12),
        const CircularProgressIndicator(
          color: Color(0xFF1A237E),
        ),
        const SizedBox(height: 20),
        const Text(
          'Completing setup...',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: DiklyColors.textPrimary,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Waiting for device to pair...',
          style: TextStyle(
            fontSize: 13,
            color: DiklyColors.textSecondary,
          ),
        ),
        const SizedBox(height: 20),
      ],
    );
  }
}
