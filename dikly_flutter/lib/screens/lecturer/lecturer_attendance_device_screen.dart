import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../widgets/ds/dikly_ds.dart';

final _myDeviceProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
  (ref) => apiService.getLecturerDevice(),
);

class LecturerAttendanceDeviceScreen extends ConsumerWidget {
  const LecturerAttendanceDeviceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncDevice = ref.watch(_myDeviceProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: const Text(
          'Attendance Device',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
        ),
        actions: asyncDevice.maybeWhen(
          data: (device) => device != null
              ? [
                  OutlinedButton(
                    onPressed: () async => ref.invalidate(_myDeviceProvider),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF374151),
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Refresh', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: () => _confirmUnlink(context, ref),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFDC2626),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                    ),
                    child: const Text('Unlink Device', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 12),
                ]
              : null,
          orElse: () => null,
        ),
      ),
      body: asyncDevice.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_myDeviceProvider),
        ),
        data: (device) => device == null
            ? _NoDeviceView(onConnected: () => ref.invalidate(_myDeviceProvider))
            : _LinkedDeviceView(device: device, ref: ref),
      ),
    );
  }

  void _confirmUnlink(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Unlink Device', style: TextStyle(fontWeight: FontWeight.w700)),
        content: const Text('This will remove the device from your account. Are you sure?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626), foregroundColor: Colors.white),
            onPressed: () async {
              Navigator.pop(context);
              try {
                await apiService.unlinkMyDevice();
                ref.invalidate(_myDeviceProvider);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString()), backgroundColor: const Color(0xFFDC2626)),
                  );
                }
              }
            },
            child: const Text('Unlink'),
          ),
        ],
      ),
    );
  }
}

// ── No device linked ──────────────────────────────────────────────────────────

class _NoDeviceView extends StatelessWidget {
  final VoidCallback onConnected;
  const _NoDeviceView({required this.onConnected});

  void _showPairingSheet(BuildContext context) {
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
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const DiklyScreenHeader(
          title: 'Attendance Device',
          subtitle: 'Your dedicated ESP32 classroom device',
        ),
        DiklyCard(
          borderRadius: 16,
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_tethering, size: 64, color: Color(0xFF9CA3AF)),
              const SizedBox(height: 16),
              const Text(
                'Connect Your Classroom Device',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
              ),
              const SizedBox(height: 8),
              const Text(
                "Tap Connect Device and we'll walk you through the setup automatically.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.5),
              ),
              const SizedBox(height: 24),
              DiklyPrimaryButton(
                label: '+ Connect Device',
                color: const Color(0xFF3F51B5),
                onPressed: () => _showPairingSheet(context),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Linked device view ────────────────────────────────────────────────────────

class _LinkedDeviceView extends StatelessWidget {
  final Map<String, dynamic> device;
  final WidgetRef ref;
  const _LinkedDeviceView({required this.device, required this.ref});

  String _formatDate(dynamic val) {
    if (val == null) return '—';
    try {
      final dt = DateTime.parse(val.toString()).toLocal();
      return '${dt.month}/${dt.day}/${dt.year}';
    } catch (_) {
      return val.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = (device['status']?.toString() ?? 'offline') == 'online';
    final lastHeartbeat = _formatDate(device['lastHeartbeat']);
    final deviceId = device['deviceId']?.toString() ?? '—';
    final deviceName = device['deviceName']?.toString() ?? 'Unknown';
    final pairedBy = device['pairedBy'];
    final lecturerName = pairedBy is Map ? pairedBy['name']?.toString() ?? '—' : '—';
    final assignedRoom = device['assignedRoom']?.toString() ?? '—';
    final assignedDept = device['assignedDepartment']?.toString() ?? '—';
    final mode = device['mode']?.toString() ?? '—';
    final registeredAt = _formatDate(device['registeredAt']);
    final currentNetwork = device['currentNetwork']?.toString() ?? '—';
    final wifiOnline = device['status']?.toString() == 'online';
    final apSSID = device['apSSID']?.toString() ?? '—';
    final activeSession = device['activeSession'];
    final sessionLabel = activeSession != null ? 'Active' : 'None';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const DiklyScreenHeader(
          title: 'Attendance Device',
          subtitle: 'Your dedicated ESP32 classroom device',
        ),

        // ── Status row ─────────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Row(
            children: [
              Row(
                children: [
                  Icon(
                    Icons.circle,
                    size: 10,
                    color: isOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isOnline ? 'Online' : 'Offline',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 16),
              const Text('|', style: TextStyle(color: Color(0xFFD1D5DB))),
              const SizedBox(width: 16),
              Text(
                'Last seen: $lastHeartbeat',
                style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
              ),
              const Spacer(),
              Text(
                'ID: $deviceId',
                style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // ── Device Details ──────────────────────────────────────────────────
        DiklyCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text(
                    'Device Details',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                  ),
                  const Spacer(),
                  OutlinedButton(
                    onPressed: () => _showRenameDialog(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF374151),
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Rename', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _DetailField(label: 'DEVICE NAME', value: deviceName)),
                  Expanded(child: _DetailField(label: 'LINKED LECTURER', value: lecturerName)),
                  Expanded(child: _DetailField(label: 'ASSIGNED ROOM', value: assignedRoom)),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _DetailField(label: 'DEPARTMENT', value: assignedDept)),
                  Expanded(child: _DetailField(label: 'DEVICE MODE', value: mode, valueColor: const Color(0xFF2563EB))),
                  Expanded(child: _DetailField(label: 'REGISTERED', value: registeredAt)),
                ],
              ),
              const SizedBox(height: 12),
              _DetailField(label: 'FIRMWARE', value: '—'),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // ── Status + WiFi Setup (2-col) ─────────────────────────────────────
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status card
            Expanded(
              child: DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Status',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                    ),
                    const SizedBox(height: 14),
                    _StatusRow(
                      label: 'CONNECTION',
                      child: Row(
                        children: [
                          Icon(Icons.circle, size: 8, color: isOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626)),
                          const SizedBox(width: 4),
                          Text(
                            isOnline ? 'Online' : 'Offline',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: isOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    _StatusRow(label: 'LAST HEARTBEAT', value: lastHeartbeat),
                    const SizedBox(height: 10),
                    _StatusRow(label: 'ACTIVE SESSION', value: sessionLabel),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Testing connection...')),
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF374151),
                          side: const BorderSide(color: Color(0xFFD1D5DB)),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Test Connection', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            // WiFi Setup card
            Expanded(
              child: DiklyCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'WiFi Setup',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                    ),
                    const SizedBox(height: 14),
                    _StatusRow(label: 'CURRENT NETWORK', value: currentNetwork),
                    const SizedBox(height: 10),
                    _StatusRow(
                      label: 'WIFI STATUS',
                      child: Row(
                        children: [
                          Icon(Icons.circle, size: 8, color: wifiOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626)),
                          const SizedBox(width: 4),
                          Text(
                            wifiOnline ? 'Connected' : 'Disconnected',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: wifiOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    _StatusRow(label: 'HOTSPOT (AP) SSID', value: apSSID),
                    const SizedBox(height: 14),
                    const Text(
                      'To change networks: access the device directly at its local IP on the same WiFi network, or hold the reset button for 5 s to re-enter setup mode.',
                      style: TextStyle(fontSize: 11, color: Color(0xFF6B7280), height: 1.5),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showRenameDialog(BuildContext context) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Rename Device', style: TextStyle(fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'Device Name'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB), foregroundColor: Colors.white),
            onPressed: () async {
              final name = ctrl.text.trim();
              Navigator.pop(context);
              if (name.isEmpty) return;
              try {
                await apiService.renameMyDevice(name);
                ref.invalidate(_myDeviceProvider);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString()), backgroundColor: const Color(0xFFDC2626)),
                  );
                }
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}

class _DetailField extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _DetailField({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: valueColor ?? const Color(0xFF111827)),
        ),
      ],
    );
  }
}

class _StatusRow extends StatelessWidget {
  final String label;
  final String? value;
  final Widget? child;
  const _StatusRow({required this.label, this.value, this.child});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5)),
        const SizedBox(height: 3),
        child ?? Text(
          value ?? '—',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
        ),
      ],
    );
  }
}

// ── Pairing bottom sheet (unchanged) ─────────────────────────────────────────

class _PairingBottomSheet extends StatefulWidget {
  const _PairingBottomSheet();

  @override
  State<_PairingBottomSheet> createState() => _PairingBottomSheetState();
}

class _PairingBottomSheetState extends State<_PairingBottomSheet> {
  int _secondsLeft = 295;
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
      if (!mounted) { t.cancel(); return; }
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

  Widget _stepCircle(String number) => Container(
    width: 28,
    height: 28,
    decoration: BoxDecoration(color: _indigo, borderRadius: BorderRadius.circular(14)),
    child: Center(child: Text(number, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14))),
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(color: const Color(0xFFE5E7EB), borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _stepCircle('1'),
                const SizedBox(width: 12),
                const Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Get a pairing code', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    SizedBox(height: 2),
                    Text('Tap Generate Code to create a one-time code.', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  ],
                )),
              ],
            ),
            const SizedBox(height: 16),
            Center(
              child: Text(_pairingCode, style: const TextStyle(fontFamily: 'monospace', fontSize: 42, fontWeight: FontWeight.w800, color: _indigo, letterSpacing: 6)),
            ),
            const SizedBox(height: 8),
            Center(child: Text(_timerLabel, style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)))),
            const SizedBox(height: 6),
            const Center(child: Text('Auto-filled in the setup portal — no need to type it', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)))),
            const SizedBox(height: 20),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _stepCircle('2'),
                const SizedBox(width: 12),
                const Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Connect to the device WiFi', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    SizedBox(height: 2),
                    Text('Power on the ESP32, then join its hotspot', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  ],
                )),
              ],
            ),
            const SizedBox(height: 12),
            const Text('1  Power on the ESP32 device — its LED will blink.', style: TextStyle(fontSize: 13, color: Color(0xFF374151))),
            const SizedBox(height: 6),
            const Text('2  Open WiFi settings on this device and connect to:', style: TextStyle(fontSize: 13, color: Color(0xFF374151))),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFF1F2937), borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  const Icon(Icons.wifi, color: Colors.white, size: 20),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('DIKLY-$_pairingCode', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15, fontFamily: 'monospace')),
                      const SizedBox(height: 2),
                      const Text('No password needed · your internet will pause briefly', style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '3  Come back here and tap Open Setup Portal. The portal opens with your code already filled in — just enter your classroom WiFi password and tap Pair Device.',
              style: TextStyle(fontSize: 13, color: Color(0xFF374151), height: 1.5),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity, height: 52,
              child: ElevatedButton(
                onPressed: () {},
                style: ElevatedButton.styleFrom(
                  backgroundColor: _indigo, foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: const Text('Open Setup Portal →', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
              child: const Text("⚠ The portal only works while you're connected to the DIKLY WiFi.", style: TextStyle(fontSize: 13, color: Color(0xFFD97706), height: 1.4)),
            ),
            const SizedBox(height: 20),

            Row(
              children: [
                const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: _indigo)),
                const SizedBox(width: 12),
                const Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Completing setup', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    Text('Waiting for device to pair...', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  ],
                )),
              ],
            ),
            const SizedBox(height: 32),
            Center(
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF6B7280),
                  side: const BorderSide(color: Color(0xFFD1D5DB)),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
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
