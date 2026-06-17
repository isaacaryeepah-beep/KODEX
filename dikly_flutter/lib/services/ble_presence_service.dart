import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// BLE token extracted from the ESP32 classroom beacon's manufacturer data.
/// Slot rotates every 30 seconds; HMAC is verified by the backend.
class BleToken {
  final int slot;
  final String hmac; // 16 hex chars (first 8 bytes of HMAC-SHA256)
  const BleToken({required this.slot, required this.hmac});
}

/// Scans for the Dikly classroom BLE beacon and reports:
///   - whether the student is within range (presence)
///   - the current BLE token (slot + HMAC) for no-code attendance marking
class BlePresenceService {
  static const String DIKLY_SERVICE_UUID = 'f000d1ce-d1ce-d1ce-d1ce-000000000000';
  static const int _rssiThreshold  = -80; // ~10-20 m indoors
  static const int _lossTimeoutSec = 300; // 5-min grace (washroom etc.)

  StreamSubscription<List<ScanResult>>? _scanSub;
  Timer? _lossTimer;
  Timer? _scanCycleTimer;
  bool      _inRange        = false;
  BleToken? _currentToken;
  DateTime? _lastSeen;
  final String? _targetDeviceName;

  final void Function(bool isPresent, int? rssi) onPresenceChanged;

  /// Optional: called whenever a new BLE token (slot/HMAC) is read from the beacon.
  final void Function(BleToken token)? onTokenReceived;

  BlePresenceService({
    required this.onPresenceChanged,
    this.onTokenReceived,
    String? deviceMacSuffix,
  }) : _targetDeviceName = deviceMacSuffix != null ? 'DK-$deviceMacSuffix' : null;

  Future<void> start() async {
    final supported = await FlutterBluePlus.isSupported;
    if (!supported) return;
    await _doScan();
    _scanCycleTimer = Timer.periodic(const Duration(seconds: 15), (_) => _doScan());
  }

  Future<void> _doScan() async {
    try {
      if (FlutterBluePlus.isScanningNow) return;
      _scanSub?.cancel();
      await FlutterBluePlus.startScan(
        withServices: [Guid(DIKLY_SERVICE_UUID)],
        timeout: const Duration(seconds: 5),
        androidUsesFineLocation: false,
      );
      _scanSub = FlutterBluePlus.scanResults.listen((results) {
        for (final r in results) {
          if (r.rssi < _rssiThreshold) continue;
          if (_targetDeviceName != null && r.device.advName != _targetDeviceName) continue;

          _lastSeen = DateTime.now();
          _lossTimer?.cancel();

          // ── Parse BLE token from manufacturer data ────────────────────────
          // ESP32 format: company=0xFFFF, payload bytes:
          //   [0-1] magic 'K'(0x4B) 'D'(0x44)
          //   [2-5] slot uint32 little-endian
          //   [6-13] HMAC-SHA256 first 8 bytes
          final mfgMap = r.advertisementData.manufacturerData;
          final mfgBytes = mfgMap[0xFFFF];
          if (mfgBytes != null && mfgBytes.length >= 14 &&
              mfgBytes[0] == 0x4B && mfgBytes[1] == 0x44) {
            final slot = mfgBytes[2] |
                (mfgBytes[3] << 8) |
                (mfgBytes[4] << 16) |
                (mfgBytes[5] << 24);
            final hmac = mfgBytes
                .sublist(6, 14)
                .map((b) => b.toRadixString(16).padLeft(2, '0'))
                .join();
            final token = BleToken(slot: slot, hmac: hmac);
            if (_currentToken == null || _currentToken!.slot != slot) {
              _currentToken = token;
              onTokenReceived?.call(token);
            }
          }

          if (!_inRange) {
            _inRange = true;
            onPresenceChanged(true, r.rssi);
          }

          _lossTimer = Timer(Duration(seconds: _lossTimeoutSec), () {
            if (_inRange) {
              _inRange = false;
              _currentToken = null;
              onPresenceChanged(false, null);
            }
          });
        }
      });
    } catch (_) {}
  }

  Future<void> stop() async {
    _scanCycleTimer?.cancel();
    _lossTimer?.cancel();
    _scanSub?.cancel();
    try {
      await FlutterBluePlus.stopScan();
    } catch (_) {}
    _inRange = false;
    _currentToken = null;
  }

  bool get isInRange => _inRange;
  BleToken? get currentToken => _currentToken;
  DateTime? get lastSeen => _lastSeen;
}
