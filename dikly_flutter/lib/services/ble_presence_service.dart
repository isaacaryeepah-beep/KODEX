import 'dart:async';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// Scans for the Dikly classroom BLE beacon and reports whether the student
/// is still within range of the ESP32 device.
///
/// The ESP32 advertises service UUID [DIKLY_SERVICE_UUID] while a session is
/// active.  When this app detects the beacon (RSSI > threshold), the student
/// is considered present.  When signal is lost for [_lossTimeoutSec] seconds,
/// the callback fires with isPresent = false.
class BlePresenceService {
  static const String DIKLY_SERVICE_UUID = 'f000d1ce-d1ce-d1ce-d1ce-000000000000';

  // RSSI threshold: signals weaker than this (further away) are ignored.
  // -80 dBm ≈ 10-20 metres in a typical indoor classroom.
  static const int _rssiThreshold = -80;
  static const int _lossTimeoutSec = 300; // 5 min grace period (washroom etc.)

  StreamSubscription<List<ScanResult>>? _scanSub;
  Timer? _lossTimer;
  Timer? _scanCycleTimer;
  bool _inRange = false;
  DateTime? _lastSeen;
  final String? _targetDeviceName; // e.g. "DK-A1B2C3" — matches specific device

  final void Function(bool isPresent, int? rssi) onPresenceChanged;

  BlePresenceService({required this.onPresenceChanged, String? deviceMacSuffix})
      : _targetDeviceName = deviceMacSuffix != null ? 'DK-$deviceMacSuffix' : null;

  /// Begin scanning.  Re-scans every 15 seconds (battery-friendly cycle).
  Future<void> start() async {
    final supported = await FlutterBluePlus.isSupported;
    if (!supported) return;

    await _doScan();
    // Repeat cycle: 5 s scan / 10 s pause
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
          // If caller specified a device name, filter to that device only
          if (_targetDeviceName != null &&
              r.device.advName != _targetDeviceName) continue;

          _lastSeen = DateTime.now();
          _lossTimer?.cancel();

          if (!_inRange) {
            _inRange = true;
            onPresenceChanged(true, r.rssi);
          }

          // Schedule a loss event if no new signal arrives within timeout
          _lossTimer = Timer(Duration(seconds: _lossTimeoutSec), () {
            if (_inRange) {
              _inRange = false;
              onPresenceChanged(false, null);
            }
          });
        }
      });
    } catch (_) {}
  }

  /// Stop scanning and clean up.
  Future<void> stop() async {
    _scanCycleTimer?.cancel();
    _lossTimer?.cancel();
    _scanSub?.cancel();
    try {
      await FlutterBluePlus.stopScan();
    } catch (_) {}
    _inRange = false;
  }

  bool get isInRange => _inRange;
  DateTime? get lastSeen => _lastSeen;
}
