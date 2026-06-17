import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/cache.dart';
import '../../core/connectivity.dart';
import '../../core/theme.dart';
import '../../services/ble_presence_service.dart';
import '../../services/offline_credential_service.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _queueProvider = StateProvider<List<Map<String, dynamic>>>(
  (ref) => CacheService.getPendingWrites(),
);

final _esp32StatusProvider = StateProvider<_Esp32Status>(
  (ref) => _Esp32Status.unknown,
);

final _syncingProvider = StateProvider<bool>((ref) => false);

enum _Esp32Status { unknown, probing, found, notFound }

// ── Auto-mark state ───────────────────────────────────────────────────────────

enum _MarkState { idle, marking, success, failed }

// ── Screen ────────────────────────────────────────────────────────────────────

class OfflineAttendanceScreen extends ConsumerStatefulWidget {
  const OfflineAttendanceScreen({super.key});

  @override
  ConsumerState<OfflineAttendanceScreen> createState() => _OfflineAttendanceScreenState();
}

class _OfflineAttendanceScreenState extends ConsumerState<OfflineAttendanceScreen> {
  // Auto-mark state
  _MarkState _markState = _MarkState.idle;
  String?    _markMessage;

  // Manual fallback
  bool _showManual = false;
  final _codeCtrl  = TextEditingController();
  bool _manualSubmitting = false;
  String? _manualMessage;
  bool    _manualSuccess = false;

  // Device info
  Map<String, dynamic>? _esp32Info;
  String _deviceIp = '192.168.4.1';

  // BLE presence
  BlePresenceService? _bleService;
  bool       _bleInRange  = false;
  BleToken?  _bleToken;

  // Presence heartbeat (after marking)
  Timer?  _heartbeatTimer;
  String? _markedUserId;
  bool    _marked = false;

  // Connection token (from device /session endpoint)
  Map<String, dynamic>? _connectionToken;

  @override
  void initState() {
    super.initState();
    // Auto-probe device when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) => _probeESP32());
  }

  @override
  void dispose() {
    _stopHeartbeat();
    _bleService?.stop();
    _codeCtrl.dispose();
    super.dispose();
  }

  // ── Device probe ────────────────────────────────────────────────────────────

  Future<void> _probeESP32() async {
    ref.read(_esp32StatusProvider.notifier).state = _Esp32Status.probing;
    final info = await apiService.probeESP32();
    if (!mounted) return;
    if (info != null) {
      setState(() {
        _esp32Info = info;
        _deviceIp  = (info['localIp'] as String?)?.isNotEmpty == true
            ? info['localIp'] as String
            : '192.168.4.1';
      });
      ref.read(_esp32StatusProvider.notifier).state = _Esp32Status.found;
      // Fetch connection token and start BLE scan simultaneously
      final user = ref.read(authProvider).user;
      if (user != null && !_marked) {
        _fetchConnectionToken(user.id);
        _startBleScanning();
      }
    } else {
      ref.read(_esp32StatusProvider.notifier).state = _Esp32Status.notFound;
    }
  }

  // ── Connection token ────────────────────────────────────────────────────────

  Future<void> _fetchConnectionToken(String userId) async {
    final token = await apiService.getESP32ConnectionToken(userId, ip: _deviceIp);
    if (!mounted) return;
    if (token != null) {
      setState(() => _connectionToken = token);
      _maybeAutoMark();
    }
  }

  // ── BLE scanning ────────────────────────────────────────────────────────────

  void _startBleScanning() {
    _bleService?.stop();
    _bleService = BlePresenceService(
      onPresenceChanged: (inRange, rssi) {
        if (!mounted) return;
        setState(() => _bleInRange = inRange);
        if (!inRange && _marked) _sendLeftSignal();
      },
      onTokenReceived: (token) {
        if (!mounted) return;
        setState(() => _bleToken = token);
        _maybeAutoMark();
      },
    );
    _bleService!.start();
  }

  // ── Auto-mark trigger ────────────────────────────────────────────────────────

  void _maybeAutoMark() {
    if (_marked || _markState == _MarkState.marking || _markState == _MarkState.success) return;
    if (_bleToken == null || _connectionToken == null) return;
    _autoMark();
  }

  Future<void> _autoMark() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    setState(() {
      _markState   = _MarkState.marking;
      _markMessage = null;
    });

    // Path 1: Direct to device with BLE token (offline-first)
    final directOk = await apiService.submitToESP32WithBle(
      userId:      user.id,
      indexNumber: user.indexNumber ?? user.id,
      bleSlot:     _bleToken!.slot,
      bleHmac:     _bleToken!.hmac,
      ip:          _deviceIp,
    );

    if (directOk) {
      _onMarkedSuccess(user);
      // Also submit to backend for cloud record (with BLE + connection token)
      _submitToBackendBle(user);
      return;
    }

    // Path 2: Backend with BLE + connection token
    try {
      await apiService.markAttendanceBle(
        bleToken: {'slot': _bleToken!.slot, 'hmac': _bleToken!.hmac},
        connectionToken: _connectionToken!,
      );
      _onMarkedSuccess(user);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _markState   = _MarkState.failed;
        _markMessage = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  void _onMarkedSuccess(dynamic user) {
    if (!mounted) return;
    setState(() {
      _markState   = _MarkState.success;
      _marked      = true;
      _markedUserId = user.indexNumber ?? user.id;
    });
    _startHeartbeat(_markedUserId!, _deviceIp);
    _refreshQueue();
  }

  // Fire-and-forget backend BLE mark (does not affect UI on failure)
  Future<void> _submitToBackendBle(dynamic user) async {
    if (_bleToken == null || _connectionToken == null) return;
    try {
      await apiService.markAttendanceBle(
        bleToken: {'slot': _bleToken!.slot, 'hmac': _bleToken!.hmac},
        connectionToken: _connectionToken!,
      );
    } catch (_) {}
  }

  // ── Manual fallback ────────────────────────────────────────────────────────

  Future<void> _submitManual() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;
    final user = ref.read(authProvider).user;
    setState(() { _manualSubmitting = true; _manualMessage = null; });

    // Try ESP32 direct
    if (ref.read(_esp32StatusProvider) == _Esp32Status.found && user != null) {
      final ok = await apiService.submitToESP32(
        code, userId: user.id, indexNumber: user.indexNumber ?? user.id,
      );
      if (ok) {
        _codeCtrl.clear();
        _startHeartbeat(user.indexNumber ?? user.id, _deviceIp);
        setState(() { _manualSubmitting = false; _manualSuccess = true; _marked = true;
          _manualMessage = 'Attendance marked!'; });
        return;
      }
    }

    // Try connectionToken flow
    if (ref.read(_esp32StatusProvider) == _Esp32Status.found && user != null) {
      final token = await apiService.getESP32ConnectionToken(user.id, ip: _deviceIp);
      if (token != null) {
        try {
          await apiService.markAttendance(code, connectionToken: token);
          _codeCtrl.clear();
          _refreshQueue();
          setState(() { _manualSubmitting = false; _manualSuccess = true; _marked = true;
            _manualMessage = 'Attendance submitted via local WiFi!'; });
          return;
        } catch (_) {}
      }
    }

    // Online/queue fallback
    try {
      await apiService.markAttendance(code);
      _codeCtrl.clear();
      _refreshQueue();
      final isOnline = ref.read(isOnlineProvider);
      setState(() {
        _manualSubmitting = false; _manualSuccess = true; _marked = true;
        _manualMessage = isOnline ? 'Attendance marked!' : 'Saved offline — will sync when connected.';
      });
    } catch (e) {
      setState(() { _manualSubmitting = false; _manualSuccess = false;
        _manualMessage = 'Error: ${e.toString().replaceAll('Exception: ', '')}'; });
    }
    _refreshQueue();
  }

  // ── Presence heartbeat ──────────────────────────────────────────────────────

  void _startHeartbeat(String userId, String deviceIp) {
    _markedUserId = userId;
    _deviceIp     = deviceIp;
    _heartbeatTimer?.cancel();
    _sendHeartbeat();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) => _sendHeartbeat());
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    if (_markedUserId != null) _sendLeftSignal();
  }

  Future<void> _sendHeartbeat() async {
    if (_markedUserId == null) return;
    try {
      final d = Dio(BaseOptions(connectTimeout: const Duration(seconds: 3), receiveTimeout: const Duration(seconds: 3)));
      await d.post('http://$_deviceIp/student/heartbeat',
          data: {'userId': _markedUserId},
          options: Options(headers: {'Content-Type': 'application/json'}));
    } catch (_) {}
  }

  Future<void> _sendLeftSignal() async {
    if (_markedUserId == null) return;
    final uid = _markedUserId;
    _markedUserId = null;
    try {
      final d = Dio(BaseOptions(connectTimeout: const Duration(seconds: 3), receiveTimeout: const Duration(seconds: 3)));
      await d.post('http://$_deviceIp/student/left',
          data: {'userId': uid},
          options: Options(headers: {'Content-Type': 'application/json'}));
    } catch (_) {}
  }

  void _refreshQueue() {
    ref.read(_queueProvider.notifier).state = CacheService.getPendingWrites();
  }

  Future<void> _syncNow() async {
    if (ref.read(_syncingProvider)) return;
    ref.read(_syncingProvider.notifier).state = true;
    try {
      await apiService.flushWriteQueue();
      _refreshQueue();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Queue flushed successfully'), backgroundColor: Color(0xFF16A34A)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Some items failed — will retry automatically'), backgroundColor: Color(0xFFD97706)),
        );
      }
    } finally {
      ref.read(_syncingProvider.notifier).state = false;
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isOnline    = ref.watch(isOnlineProvider);
    final queue       = ref.watch(_queueProvider);
    final esp32Status = ref.watch(_esp32StatusProvider);
    final syncing     = ref.watch(_syncingProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: Text('Attendance',
            style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: const Color(0xFF111827))),
        actions: [
          if (queue.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: TextButton.icon(
                onPressed: syncing ? null : _syncNow,
                icon: syncing
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.sync, size: 16),
                label: Text(syncing ? 'Syncing…' : 'Sync Now',
                    style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _ConnectivityCard(
            isOnline: isOnline,
            esp32Status: esp32Status,
            esp32Info: _esp32Info,
            bleInRange: _bleInRange,
            onRescan: _probeESP32,
          ),
          const SizedBox(height: 16),

          // ── Auto-mark card ─────────────────────────────────────────────────
          _AutoMarkCard(
            esp32Status: esp32Status,
            bleInRange: _bleInRange,
            bleToken: _bleToken,
            connectionToken: _connectionToken,
            markState: _markState,
            markMessage: _markMessage,
            marked: _marked,
            onRetry: _maybeAutoMark,
          ),
          const SizedBox(height: 12),

          // ── Manual fallback ───────────────────────────────────────────────
          GestureDetector(
            onTap: () => setState(() => _showManual = !_showManual),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  _showManual ? 'Hide manual entry' : 'Enter code manually (fallback)',
                  style: GoogleFonts.dmSans(fontSize: 12, color: const Color(0xFF6B7280),
                      decoration: TextDecoration.underline),
                ),
                Icon(_showManual ? Icons.expand_less : Icons.expand_more,
                    size: 16, color: const Color(0xFF6B7280)),
              ],
            ),
          ),
          if (_showManual) ...[
            const SizedBox(height: 10),
            _ManualCard(
              controller: _codeCtrl,
              submitting: _manualSubmitting,
              onSubmit: _submitManual,
              lastMessage: _manualMessage,
              lastSuccess: _manualSuccess,
            ),
          ],
          const SizedBox(height: 20),

          _QueueSection(queue: queue, syncing: syncing, onSync: _syncNow, onRefresh: _refreshQueue),
        ],
      ),
    );
  }
}

// ── Connectivity Card ─────────────────────────────────────────────────────────

class _ConnectivityCard extends StatelessWidget {
  final bool isOnline;
  final _Esp32Status esp32Status;
  final Map<String, dynamic>? esp32Info;
  final bool bleInRange;
  final VoidCallback onRescan;

  const _ConnectivityCard({
    required this.isOnline,
    required this.esp32Status,
    required this.esp32Info,
    required this.bleInRange,
    required this.onRescan,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Connectivity', style: GoogleFonts.dmSans(
              fontSize: 11, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.2)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Pill(
                icon: isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                label: isOnline ? 'Internet' : 'No Internet',
                color: isOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
              ),
              _Pill(
                icon: Icons.router_rounded,
                label: esp32Status == _Esp32Status.found
                    ? 'Device found'
                    : esp32Status == _Esp32Status.probing
                        ? 'Scanning…'
                        : esp32Status == _Esp32Status.notFound
                            ? 'No device'
                            : 'Device',
                color: esp32Status == _Esp32Status.found
                    ? const Color(0xFF2563EB)
                    : esp32Status == _Esp32Status.notFound
                        ? const Color(0xFF6B7280)
                        : const Color(0xFFD97706),
              ),
              _Pill(
                icon: Icons.bluetooth_rounded,
                label: bleInRange ? 'BLE in range' : 'BLE scanning…',
                color: bleInRange ? const Color(0xFF7C3AED) : const Color(0xFF9CA3AF),
              ),
            ],
          ),
          if (esp32Info != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(8)),
              child: Text(
                'Session: ${esp32Info!['sessionTitle'] ?? esp32Info!['sessionId'] ?? '—'}',
                style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF1D4ED8)),
              ),
            ),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: esp32Status == _Esp32Status.probing ? null : onRescan,
              icon: esp32Status == _Esp32Status.probing
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.search_rounded, size: 16),
              label: Text(
                  esp32Status == _Esp32Status.probing ? 'Scanning…' : 'Scan for Classroom Device',
                  style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFFD1D5DB)),
                foregroundColor: const Color(0xFF374151),
                padding: const EdgeInsets.symmetric(vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Connect your phone to the classroom WiFi hotspot (DIKLY-XXXXXX) — attendance marks automatically.',
            style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF9CA3AF), height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _Pill({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Text(label, style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

// ── Auto-mark Card ────────────────────────────────────────────────────────────

class _AutoMarkCard extends StatelessWidget {
  final _Esp32Status esp32Status;
  final bool bleInRange;
  final BleToken? bleToken;
  final Map<String, dynamic>? connectionToken;
  final _MarkState markState;
  final String? markMessage;
  final bool marked;
  final VoidCallback onRetry;

  const _AutoMarkCard({
    required this.esp32Status,
    required this.bleInRange,
    required this.bleToken,
    required this.connectionToken,
    required this.markState,
    required this.markMessage,
    required this.marked,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final deviceOk = esp32Status == _Esp32Status.found && connectionToken != null;
    final bleOk    = bleInRange && bleToken != null;
    final allReady = deviceOk && bleOk;

    Color cardColor;
    Color borderColor;
    if (marked || markState == _MarkState.success) {
      cardColor   = const Color(0xFFF0FDF4);
      borderColor = const Color(0xFF16A34A);
    } else if (markState == _MarkState.failed) {
      cardColor   = const Color(0xFFFEF2F2);
      borderColor = const Color(0xFFDC2626);
    } else if (allReady) {
      cardColor   = const Color(0xFFF5F3FF);
      borderColor = const Color(0xFF7C3AED);
    } else {
      cardColor   = Colors.white;
      borderColor = const Color(0xFFE5E7EB);
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor.withOpacity(0.5)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Auto Attendance',
              style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w700,
                  color: const Color(0xFF9CA3AF), letterSpacing: 1.2)),
          const SizedBox(height: 14),

          // Check list
          _CheckRow(
            label: 'On classroom WiFi hotspot',
            done: esp32Status == _Esp32Status.found,
            loading: esp32Status == _Esp32Status.probing,
          ),
          const SizedBox(height: 8),
          _CheckRow(
            label: 'WiFi proof received from device',
            done: connectionToken != null,
            loading: esp32Status == _Esp32Status.found && connectionToken == null,
          ),
          const SizedBox(height: 8),
          _CheckRow(
            label: 'BLE beacon in range (≤ 10 m)',
            done: bleInRange,
            loading: !bleInRange,
          ),
          const SizedBox(height: 8),
          _CheckRow(
            label: 'BLE token verified',
            done: bleToken != null,
            loading: bleInRange && bleToken == null,
          ),
          const SizedBox(height: 16),

          // Status / action
          if (marked || markState == _MarkState.success)
            _StatusBanner(
              icon: Icons.check_circle_rounded,
              text: 'You are marked present. Live tracking active.',
              color: const Color(0xFF16A34A),
            )
          else if (markState == _MarkState.marking)
            _StatusBanner(
              icon: Icons.autorenew_rounded,
              text: 'Marking attendance…',
              color: const Color(0xFF7C3AED),
              spinning: true,
            )
          else if (markState == _MarkState.failed) ...[
            _StatusBanner(
              icon: Icons.error_outline_rounded,
              text: markMessage ?? 'Could not mark attendance. Try manual entry below.',
              color: const Color(0xFFDC2626),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onRetry,
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFFDC2626)),
                  foregroundColor: const Color(0xFFDC2626),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: Text('Retry', style: GoogleFonts.dmSans(fontWeight: FontWeight.w700)),
              ),
            ),
          ] else if (allReady)
            _StatusBanner(
              icon: Icons.radar_rounded,
              text: 'All checks passed — marking attendance…',
              color: const Color(0xFF7C3AED),
              spinning: true,
            )
          else
            _StatusBanner(
              icon: Icons.info_outline_rounded,
              text: 'Connect to the classroom WiFi hotspot (DIKLY-XXXXXX) and stay within BLE range — attendance marks automatically.',
              color: const Color(0xFF6B7280),
            ),
        ],
      ),
    );
  }
}

class _CheckRow extends StatelessWidget {
  final String label;
  final bool done;
  final bool loading;
  const _CheckRow({required this.label, required this.done, this.loading = false});

  @override
  Widget build(BuildContext context) {
    final color = done
        ? const Color(0xFF16A34A)
        : loading
            ? const Color(0xFFD97706)
            : const Color(0xFF9CA3AF);
    return Row(
      children: [
        SizedBox(
          width: 20, height: 20,
          child: done
              ? const Icon(Icons.check_circle_rounded, size: 18, color: Color(0xFF16A34A))
              : loading
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFD97706)),
                    )
                  : const Icon(Icons.radio_button_unchecked_rounded, size: 18, color: Color(0xFFD1D5DB)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(label,
              style: GoogleFonts.dmSans(
                  fontSize: 13,
                  color: color,
                  fontWeight: done ? FontWeight.w600 : FontWeight.w400)),
        ),
      ],
    );
  }
}

class _StatusBanner extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  final bool spinning;
  const _StatusBanner({required this.icon, required this.text, required this.color, this.spinning = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          spinning
              ? SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: color))
              : Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: GoogleFonts.dmSans(fontSize: 13, color: color, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

// ── Manual Entry Card ─────────────────────────────────────────────────────────

class _ManualCard extends StatelessWidget {
  final TextEditingController controller;
  final bool submitting;
  final VoidCallback onSubmit;
  final String? lastMessage;
  final bool lastSuccess;

  const _ManualCard({
    required this.controller,
    required this.submitting,
    required this.onSubmit,
    required this.lastMessage,
    required this.lastSuccess,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Manual Code Entry',
              style: GoogleFonts.dmSans(fontSize: 11, fontWeight: FontWeight.w700,
                  color: const Color(0xFF9CA3AF), letterSpacing: 1.2)),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            keyboardType: TextInputType.text,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              hintText: 'Enter session code',
              prefixIcon: const Icon(Icons.tag_rounded, size: 20),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: Color(0xFF2563EB))),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            ),
            onSubmitted: (_) => onSubmit(),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: submitting ? null : onSubmit,
              icon: submitting
                  ? const SizedBox(width: 16, height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check_circle_outline_rounded, size: 18),
              label: Text(submitting ? 'Submitting…' : 'Submit',
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB), foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
            ),
          ),
          if (lastMessage != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: lastSuccess ? const Color(0xFFF0FDF4) : const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                    color: lastSuccess
                        ? const Color(0xFF16A34A).withOpacity(0.3)
                        : const Color(0xFFDC2626).withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(lastSuccess ? Icons.check_circle_outline : Icons.error_outline, size: 16,
                      color: lastSuccess ? const Color(0xFF16A34A) : const Color(0xFFDC2626)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(lastMessage!,
                        style: GoogleFonts.dmSans(fontSize: 13,
                            color: lastSuccess ? const Color(0xFF15803D) : const Color(0xFFDC2626))),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Queue Section ─────────────────────────────────────────────────────────────

class _QueueSection extends StatelessWidget {
  final List<Map<String, dynamic>> queue;
  final bool syncing;
  final VoidCallback onSync;
  final VoidCallback onRefresh;

  const _QueueSection({
    required this.queue,
    required this.syncing,
    required this.onSync,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('PENDING SYNC',
                style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700,
                    color: const Color(0xFF9CA3AF), letterSpacing: 1.5)),
            const SizedBox(width: 8),
            if (queue.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFFD97706), borderRadius: BorderRadius.circular(10)),
                child: Text('${queue.length}',
                    style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            const Spacer(),
            IconButton(
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh, size: 18, color: Color(0xFF9CA3AF)),
                padding: EdgeInsets.zero, constraints: const BoxConstraints()),
          ],
        ),
        const SizedBox(height: 8),
        if (queue.isEmpty)
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Color(0xFF16A34A), size: 20),
                const SizedBox(width: 10),
                Text('All synced — no pending items',
                    style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF374151))),
              ],
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
            ),
            child: Column(
              children: [
                ...queue.asMap().entries.map((e) {
                  final i = e.key; final op = e.value;
                  final path = op['path']?.toString() ?? '';
                  final queuedAt = op['queuedAt']?.toString() ?? '';
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    decoration: BoxDecoration(
                      border: i < queue.length - 1
                          ? const Border(bottom: BorderSide(color: Color(0xFFF3F4F6)))
                          : null,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 32, height: 32,
                          decoration: BoxDecoration(
                              color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.pending_rounded, size: 16, color: Color(0xFFD97706)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_labelFor(path),
                                  style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600,
                                      color: const Color(0xFF111827))),
                              if (queuedAt.isNotEmpty)
                                Text(_formatTime(queuedAt),
                                    style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF9CA3AF))),
                            ],
                          ),
                        ),
                        const Icon(Icons.schedule_rounded, size: 14, color: Color(0xFFD97706)),
                      ],
                    ),
                  );
                }),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: Color(0xFFF3F4F6))),
                    borderRadius:
                        BorderRadius.only(bottomLeft: Radius.circular(12), bottomRight: Radius.circular(12)),
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: syncing ? null : onSync,
                      icon: syncing
                          ? const SizedBox(width: 14, height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.sync_rounded, size: 16),
                      label: Text(
                          syncing ? 'Syncing…' : 'Sync ${queue.length} Item${queue.length == 1 ? '' : 's'} Now',
                          style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFD97706), foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        elevation: 0,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  String _labelFor(String path) {
    if (path.contains('mark')) return 'Attendance Mark';
    if (path.contains('clock-in')) return 'Clock In';
    if (path.contains('clock-out')) return 'Clock Out';
    if (path.contains('leaves')) return 'Leave Request';
    if (path.contains('expenses')) return 'Expense Report';
    if (path.contains('assignments')) return 'Assignment Submission';
    if (path.contains('announcements')) return 'Announcement';
    return path.split('/').last.replaceAll('-', ' ').toUpperCase();
  }

  String _formatTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      final day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dt.weekday - 1];
      return '$day $h:$m';
    } catch (_) {
      return iso;
    }
  }
}
