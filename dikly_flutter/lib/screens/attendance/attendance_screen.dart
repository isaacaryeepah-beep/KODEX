import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  bool _loading = false;
  bool _markingAttendance = false;
  final _codeController = TextEditingController();

  bool _esp32Found = false;
  bool _esp32SessionActive = false;
  final String _esp32Ip = '192.168.4.1';

  @override
  void initState() {
    super.initState();
    _probeESP32();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _probeESP32() async {
    final status = await apiService.probeESP32(ip: _esp32Ip);
    if (!mounted) return;
    setState(() {
      _esp32Found = status != null;
      _esp32SessionActive = status?['sessionActive'] == true;
    });
  }

  Future<void> _markAttendance() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter the attendance code'), backgroundColor: DiklyColors.error),
      );
      return;
    }
    setState(() => _markingAttendance = true);
    try {
      final user = ref.read(currentUserProvider);
      final userId = user?.id ?? '';
      final indexNumber = user?.indexNumber ?? '';

      if (_esp32Found) {
        final ok = await apiService.submitToESP32(
          code,
          userId: userId,
          indexNumber: indexNumber,
          ip: _esp32Ip,
        );
        if (ok) {
          _codeController.clear();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Attendance recorded! You can now disconnect from classroom WiFi.'),
                backgroundColor: DiklyColors.success,
              ),
            );
          }
          return;
        }

        final token = await apiService.getESP32ConnectionToken(userId, ip: _esp32Ip);
        if (token != null) {
          await apiService.markAttendance(code, connectionToken: token);
          _codeController.clear();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Attendance marked successfully!'), backgroundColor: DiklyColors.success),
            );
          }
          return;
        }
      }

      await apiService.markAttendance(code);
      _codeController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Attendance marked successfully!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAttendance = false);
    }
  }

  Future<void> _markAttendanceWithQR(String qrToken) async {
    setState(() => _markingAttendance = true);
    try {
      await apiService.markAttendanceQR(qrToken);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Attendance marked via QR!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}'),
            backgroundColor: DiklyColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAttendance = false);
    }
  }

  void _openQRScanner() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _QRScanSheet(
        onScanned: (token) {
          Navigator.pop(ctx);
          _markAttendanceWithQR(token);
        },
      ),
    );
  }

  void _showMarkAttendanceDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.fact_check_rounded, color: DiklyColors.primary, size: 24),
                  const SizedBox(width: 10),
                  Text('Mark Attendance',
                      style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.pop(ctx),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              if (_esp32Found) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: DiklyColors.success.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: DiklyColors.success.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.wifi_rounded, size: 16, color: DiklyColors.success),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Connected to classroom device${_esp32SessionActive ? ' — session active' : ''}',
                          style: const TextStyle(
                              fontSize: 12, color: DiklyColors.success, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _openQRScanner();
                  },
                  icon: const Icon(Icons.qr_code_scanner_rounded, size: 20),
                  label: const Text('Scan QR Code'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: DiklyColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(children: [
                const Expanded(child: Divider()),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('or enter code manually',
                      style: TextStyle(fontSize: 12, color: DiklyColors.textLight)),
                ),
                const Expanded(child: Divider()),
              ]),
              const SizedBox(height: 12),
              TextField(
                controller: _codeController,
                autofocus: false,
                keyboardType: TextInputType.number,
                maxLength: 6,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 6),
                textAlign: TextAlign.center,
                decoration: const InputDecoration(
                  hintText: '000000',
                  hintStyle: TextStyle(letterSpacing: 6, color: DiklyColors.textSecondary),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _markingAttendance
                      ? null
                      : () {
                          Navigator.pop(ctx);
                          _markAttendance();
                        },
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: const BorderSide(color: DiklyColors.primary),
                    foregroundColor: DiklyColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _markingAttendance
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Submit Code'),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'Mark Attendance',
          subtitle: 'Check in to active sessions',
        ),
        // WiFi instruction banner
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFEFF6FF),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFBFDBFE)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 2),
                child: const Icon(Icons.wifi_rounded, size: 18, color: Color(0xFF2563EB)),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Connect to classroom WiFi first',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1E40AF),
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Go to phone WiFi settings → connect to Dikly-XXXXXX',
                      style: TextStyle(fontSize: 12, color: Color(0xFF1D4ED8)),
                    ),
                    SizedBox(height: 2),
                    Text.rich(
                      TextSpan(
                        text: "If your phone says 'Internet may not be available' — tap ",
                        style: TextStyle(fontSize: 12, color: Color(0xFF1D4ED8)),
                        children: [
                          TextSpan(
                            text: 'Stay connected.',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // Ready to mark card
        Container(
          padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: DiklyColors.border),
            boxShadow: const [
              BoxShadow(color: Color(0x08000000), blurRadius: 8, offset: Offset(0, 2)),
            ],
          ),
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7ED),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.bar_chart_rounded,
                  size: 40,
                  color: Color(0xFFF97316),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Ready to mark attendance',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF111827),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Connect to Dikly-XXXXXX WiFi, then tap the button below',
                style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _markingAttendance ? null : _showMarkAttendanceDialog,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  child: _markingAttendance
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text(
                          'Mark Attendance',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── QR Scanner sheet ────────────────────────────────────────────────────────

class _QRScanSheet extends StatefulWidget {
  final void Function(String token) onScanned;
  const _QRScanSheet({required this.onScanned});

  @override
  State<_QRScanSheet> createState() => _QRScanSheetState();
}

class _QRScanSheetState extends State<_QRScanSheet> {
  final MobileScannerController _controller = MobileScannerController();
  bool _scanned = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_scanned) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null) return;

    String? token;
    try {
      final uri = Uri.parse(raw);
      token = uri.queryParameters['qr_token'];
    } catch (_) {}
    token ??= raw.trim();

    if (token.isEmpty) return;
    _scanned = true;
    widget.onScanned(token);
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.65,
      child: Column(
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(top: 12, bottom: 16),
            decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                const Icon(Icons.qr_code_scanner_rounded, color: Colors.white, size: 22),
                const SizedBox(width: 10),
                const Text('Scan QR Code',
                    style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Text('Point your camera at the QR code on the board',
              style: TextStyle(color: Colors.white60, fontSize: 13)),
          const SizedBox(height: 16),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Stack(
                  children: [
                    MobileScanner(
                      controller: _controller,
                      onDetect: _onDetect,
                    ),
                    Center(
                      child: Container(
                        width: 220,
                        height: 220,
                        decoration: BoxDecoration(
                          border: Border.all(color: DiklyColors.primary, width: 3),
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: () => _controller.toggleTorch(),
                icon: const Icon(Icons.flashlight_on_rounded, color: Colors.white70, size: 28),
              ),
              const SizedBox(width: 8),
              const Text('Torch', style: TextStyle(color: Colors.white60, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
