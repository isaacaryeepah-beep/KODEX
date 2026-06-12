import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/attendance.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/ds/dikly_ds.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  List<AttendanceSession> _sessions = [];
  bool _loading = true;
  String? _error;
  final _codeController = TextEditingController();
  bool _markingAttendance = false;

  // ESP32 device state — detected via native HTTP (no mixed-content restriction)
  bool _esp32Found = false;
  bool _esp32SessionActive = false;
  String _esp32Ip = '192.168.4.1';
  Map<String, dynamic>? _esp32Status;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final sessions = await apiService.getAttendanceSessions();
      setState(() { _sessions = sessions; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
    // Probe ESP32 in parallel — native HTTP, no mixed-content restriction
    _probeESP32();
  }

  Future<void> _probeESP32() async {
    final status = await apiService.probeESP32(ip: _esp32Ip);
    if (!mounted) return;
    setState(() {
      _esp32Found = status != null;
      _esp32Status = status;
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

      // Path 1: S3 firmware — submit directly to device (works even without internet)
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
              const SnackBar(content: Text('Attendance recorded! You can now disconnect from classroom WiFi.'), backgroundColor: DiklyColors.success),
            );
          }
          return;
        }
        // false = 404/405 (standard firmware) — fall through to Path 2/3

        // Path 2: standard firmware — get connectionToken from device, then cloud API
        final token = await apiService.getESP32ConnectionToken(userId, ip: _esp32Ip);
        if (token != null) {
          await apiService.markAttendance(code, connectionToken: token);
          _codeController.clear();
          await _loadData();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Attendance marked successfully!'), backgroundColor: DiklyColors.success),
            );
          }
          return;
        }
      }

      // Path 3: code-only cloud API (server validates TOTP as proximity proof)
      await apiService.markAttendance(code);
      _codeController.clear();
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Attendance marked successfully!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAttendance = false);
    }
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
                  Text('Mark Attendance', style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
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
                          style: const TextStyle(fontSize: 12, color: DiklyColors.success, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              // QR Scan button — primary option
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
                  child: Text('or enter code manually', style: TextStyle(fontSize: 12, color: DiklyColors.textLight)),
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

  Future<void> _markAttendanceWithQR(String qrToken) async {
    setState(() => _markingAttendance = true);
    try {
      await apiService.markAttendanceQR(qrToken);
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Attendance marked via QR!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _markingAttendance = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isLecturer = user?.role == 'lecturer';

    return AppShell(
      title: 'Attendance',
      floatingActionButton: !isLecturer
          ? FloatingActionButton.extended(
              onPressed: _showMarkAttendanceDialog,
              icon: const Icon(Icons.fact_check_rounded),
              label: const Text('Mark Attendance'),
            )
          : null,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      'Unable to load data. Pull down to refresh.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                  ],
                ))
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: _sessions.isEmpty
                      ? DiklyEmptyState(
                          icon: Icons.fact_check_outlined,
                          title: 'No attendance sessions',
                          subtitle: 'Attendance sessions will appear here',
                          buttonLabel: isLecturer ? null : 'Mark Attendance',
                          onButton: isLecturer ? null : _showMarkAttendanceDialog,
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _sessions.length,
                          itemBuilder: (context, index) {
                            final session = _sessions[index];
                            return _AttendanceSessionCard(
                              session: session,
                              isLecturer: isLecturer,
                              onMark: _showMarkAttendanceDialog,
                            );
                          },
                        ),
                ),
    );
  }
}

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

    // The QR encodes a URL: https://...?qr_token=<token>&qr_code=<code>
    // Try parsing as URL first, else treat the whole string as the token
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
          // Handle bar
          Container(
            width: 40, height: 4,
            margin: const EdgeInsets.only(top: 12, bottom: 16),
            decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                const Icon(Icons.qr_code_scanner_rounded, color: Colors.white, size: 22),
                const SizedBox(width: 10),
                const Text('Scan QR Code', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
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
          const Text('Point your camera at the QR code on the board', style: TextStyle(color: Colors.white60, fontSize: 13)),
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
                    // Scan frame overlay
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
          // Torch toggle
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

class _AttendanceSessionCard extends StatelessWidget {
  final AttendanceSession session;
  final bool isLecturer;
  final VoidCallback onMark;

  const _AttendanceSessionCard({required this.session, required this.isLecturer, required this.onMark});

  @override
  Widget build(BuildContext context) {
    final statusColor = session.isOpen ? DiklyColors.success : DiklyColors.textSecondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: session.isOpen ? DiklyColors.success.withOpacity(0.3) : DiklyColors.border,
        ),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(session.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: statusColor.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (session.isOpen)
                      Container(width: 6, height: 6, margin: const EdgeInsets.only(right: 4), decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle)),
                    Text(session.isOpen ? 'Open' : 'Closed', style: TextStyle(fontSize: 11, color: statusColor, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (session.courseName != null) ...[
            Row(
              children: [
                const Icon(Icons.school_outlined, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(session.courseName!, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
            const SizedBox(height: 4),
          ],
          if (session.startTime != null)
            Row(
              children: [
                const Icon(Icons.schedule_outlined, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(DateFormat('MMM d, h:mm a').format(session.startTime!), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
          if (isLecturer && session.presentCount != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.people_outline, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text('${session.presentCount}/${session.totalStudents ?? '?'} present', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
              ],
            ),
            if (session.code != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: DiklyColors.primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.key_rounded, size: 14, color: DiklyColors.primary),
                    const SizedBox(width: 6),
                    Text('Code: ${session.code}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.primary, letterSpacing: 2)),
                  ],
                ),
              ),
            ],
          ],
          if (!isLecturer && session.isOpen && !session.isMarked) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onMark,
                icon: const Icon(Icons.fact_check_rounded, size: 16),
                label: const Text('Mark Attendance'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.success,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                ),
              ),
            ),
          ],
          if (!isLecturer && session.isMarked)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: DiklyColors.success.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle_outline_rounded, size: 14, color: DiklyColors.success),
                  SizedBox(width: 6),
                  Text('Attendance marked', style: TextStyle(fontSize: 12, color: DiklyColors.success, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
