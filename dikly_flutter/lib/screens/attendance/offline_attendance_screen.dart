import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/cache.dart';
import '../../core/connectivity.dart';
import '../../core/theme.dart';
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

// ── Screen ────────────────────────────────────────────────────────────────────

class OfflineAttendanceScreen extends ConsumerStatefulWidget {
  const OfflineAttendanceScreen({super.key});

  @override
  ConsumerState<OfflineAttendanceScreen> createState() => _OfflineAttendanceScreenState();
}

class _OfflineAttendanceScreenState extends ConsumerState<OfflineAttendanceScreen> {
  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  String? _lastMessage;
  bool _lastSuccess = false;
  Map<String, dynamic>? _esp32Info;
  bool _credentialSent = false;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  void _refreshQueue() {
    ref.read(_queueProvider.notifier).state = CacheService.getPendingWrites();
  }

  Future<void> _probeESP32() async {
    ref.read(_esp32StatusProvider.notifier).state = _Esp32Status.probing;
    final info = await apiService.probeESP32();
    if (info != null) {
      setState(() => _esp32Info = info);
      ref.read(_esp32StatusProvider.notifier).state = _Esp32Status.found;
      // Auto-send credential so enrollment is verified before the student types
      if (!_credentialSent) _autoSendCredential(info);
    } else {
      ref.read(_esp32StatusProvider.notifier).state = _Esp32Status.notFound;
    }
  }

  /// Automatically send the cached offline credential to the ESP32 device.
  /// This authorizes the user before they even touch the form.
  Future<void> _autoSendCredential(Map<String, dynamic> deviceInfo) async {
    final user = ref.read(authProvider).user;
    if (user == null) return;

    final role = user.role ?? 'student';
    // ESP32 AP always assigns itself 192.168.4.1 as the gateway
    final deviceIp = (deviceInfo['localIp'] as String?)?.isNotEmpty == true
        ? deviceInfo['localIp'] as String
        : '192.168.4.1';

    final result = await OfflineCredentialService.sendToDevice(deviceIp, role);
    if (!mounted) return;

    if (result != null && result['ok'] == true) {
      setState(() {
        _credentialSent = true;
        _lastSuccess = true;
        _lastMessage = role == 'lecturer'
            ? 'Verified as lecturer — you can start the session.'
            : 'Identity verified — you are enrolled in this course.';
      });
    }
    // Failure is silent — student can still mark via the form (roster check on device)
  }

  Future<void> _submitCode() async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) return;

    final user = ref.read(authProvider).user;
    setState(() { _submitting = true; _lastMessage = null; });

    // 1. Try ESP32 local WiFi first (fastest, works without internet)
    if (ref.read(_esp32StatusProvider) == _Esp32Status.found && user != null) {
      final ok = await apiService.submitToESP32(
        code,
        userId: user.id,
        indexNumber: user.indexNumber ?? user.id,
      );
      if (ok) {
        _codeCtrl.clear();
        setState(() {
          _submitting = false;
          _lastSuccess = true;
          _lastMessage = 'Attendance marked via local device!';
        });
        return;
      }
    }

    // 2. Try connectionToken flow (standard firmware)
    if (ref.read(_esp32StatusProvider) == _Esp32Status.found && user != null) {
      final token = await apiService.getESP32ConnectionToken(user.id);
      if (token != null) {
        try {
          await apiService.markAttendance(code, connectionToken: token);
          _codeCtrl.clear();
          _refreshQueue();
          setState(() {
            _submitting = false;
            _lastSuccess = true;
            _lastMessage = 'Attendance submitted via local WiFi!';
          });
          return;
        } catch (_) {}
      }
    }

    // 3. Online mark or queue for later
    try {
      await apiService.markAttendance(code);
      _codeCtrl.clear();
      _refreshQueue();
      final isOnline = ref.read(isOnlineProvider);
      setState(() {
        _submitting = false;
        _lastSuccess = true;
        _lastMessage = isOnline ? 'Attendance marked!' : 'Saved offline — will sync when connected.';
      });
    } catch (e) {
      setState(() {
        _submitting = false;
        _lastSuccess = false;
        _lastMessage = 'Error: ${e.toString().replaceAll('Exception: ', '')}';
      });
    }
    _refreshQueue();
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

  @override
  Widget build(BuildContext context) {
    final isOnline = ref.watch(isOnlineProvider);
    final queue = ref.watch(_queueProvider);
    final esp32Status = ref.watch(_esp32StatusProvider);
    final syncing = ref.watch(_syncingProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: Text(
          'Offline Attendance',
          style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: const Color(0xFF111827)),
        ),
        actions: [
          if (queue.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: TextButton.icon(
                onPressed: syncing ? null : _syncNow,
                icon: syncing
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.sync, size: 16),
                label: Text(syncing ? 'Syncing…' : 'Sync Now', style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // ── Network Status Card ───────────────────────────────────────────
          _StatusCard(isOnline: isOnline, esp32Status: esp32Status, esp32Info: _esp32Info, onProbe: _probeESP32),
          const SizedBox(height: 16),

          // ── Code Entry ────────────────────────────────────────────────────
          _CodeEntryCard(
            controller: _codeCtrl,
            submitting: _submitting,
            onSubmit: _submitCode,
            lastMessage: _lastMessage,
            lastSuccess: _lastSuccess,
          ),
          const SizedBox(height: 20),

          // ── Pending Queue ─────────────────────────────────────────────────
          _QueueSection(queue: queue, syncing: syncing, onSync: _syncNow, onRefresh: _refreshQueue),
        ],
      ),
    );
  }
}

// ── Status Card ───────────────────────────────────────────────────────────────

class _StatusCard extends StatelessWidget {
  final bool isOnline;
  final _Esp32Status esp32Status;
  final Map<String, dynamic>? esp32Info;
  final VoidCallback onProbe;

  const _StatusCard({
    required this.isOnline,
    required this.esp32Status,
    required this.esp32Info,
    required this.onProbe,
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
          Text('Connectivity', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.2)),
          const SizedBox(height: 12),
          Row(
            children: [
              _StatusPill(
                icon: isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                label: isOnline ? 'Internet Connected' : 'No Internet',
                color: isOnline ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
              ),
              const SizedBox(width: 10),
              _StatusPill(
                icon: esp32Status == _Esp32Status.found
                    ? Icons.router_rounded
                    : Icons.router_outlined,
                label: esp32Status == _Esp32Status.found
                    ? 'Device Found'
                    : esp32Status == _Esp32Status.probing
                        ? 'Scanning…'
                        : esp32Status == _Esp32Status.notFound
                            ? 'No Device'
                            : 'Local Device',
                color: esp32Status == _Esp32Status.found
                    ? const Color(0xFF2563EB)
                    : esp32Status == _Esp32Status.notFound
                        ? const Color(0xFF6B7280)
                        : const Color(0xFFD97706),
              ),
            ],
          ),
          if (esp32Info != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Session: ${esp32Info!['sessionId'] ?? '—'}  ·  Device: ${esp32Info!['deviceName'] ?? '—'}',
                style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF1D4ED8)),
              ),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: esp32Status == _Esp32Status.probing ? null : onProbe,
              icon: esp32Status == _Esp32Status.probing
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.search_rounded, size: 16),
              label: Text(
                esp32Status == _Esp32Status.probing ? 'Scanning for device…' : 'Scan for Local Device (192.168.4.1)',
                style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600),
              ),
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
            'Connect to the classroom WiFi hotspot to submit attendance directly to the hardware device — no internet required.',
            style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF9CA3AF), height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _StatusPill({required this.icon, required this.label, required this.color});

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

// ── Code Entry Card ───────────────────────────────────────────────────────────

class _CodeEntryCard extends StatelessWidget {
  final TextEditingController controller;
  final bool submitting;
  final VoidCallback onSubmit;
  final String? lastMessage;
  final bool lastSuccess;

  const _CodeEntryCard({
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
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Mark Attendance', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.2)),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            keyboardType: TextInputType.text,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              hintText: 'Enter session code',
              prefixIcon: const Icon(Icons.tag_rounded, size: 20),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE5E7EB))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFF2563EB))),
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
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.check_circle_outline_rounded, size: 18),
              label: Text(submitting ? 'Submitting…' : 'Submit Attendance', style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
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
                border: Border.all(color: lastSuccess ? const Color(0xFF16A34A).withOpacity(0.3) : const Color(0xFFDC2626).withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(
                    lastSuccess ? Icons.check_circle_outline : Icons.error_outline,
                    size: 16,
                    color: lastSuccess ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      lastMessage!,
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: lastSuccess ? const Color(0xFF15803D) : const Color(0xFFDC2626),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'Works online, on local device WiFi, or offline (queued for sync).',
            style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF9CA3AF), height: 1.4),
          ),
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
            Text('PENDING SYNC', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF9CA3AF), letterSpacing: 1.5)),
            const SizedBox(width: 8),
            if (queue.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFFD97706), borderRadius: BorderRadius.circular(10)),
                child: Text('${queue.length}', style: GoogleFonts.dmSans(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            const Spacer(),
            IconButton(onPressed: onRefresh, icon: const Icon(Icons.refresh, size: 18, color: Color(0xFF9CA3AF)), padding: EdgeInsets.zero, constraints: const BoxConstraints()),
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
                Text('All synced — no pending items', style: GoogleFonts.dmSans(fontSize: 13, color: const Color(0xFF374151))),
              ],
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 4, offset: const Offset(0, 1))],
            ),
            child: Column(
              children: [
                ...queue.asMap().entries.map((e) {
                  final i = e.key;
                  final op = e.value;
                  final path = op['path']?.toString() ?? '';
                  final queuedAt = op['queuedAt']?.toString() ?? '';
                  final label = _labelFor(path);
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
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.pending_rounded, size: 16, color: Color(0xFFD97706)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(label, style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w600, color: const Color(0xFF111827))),
                              if (queuedAt.isNotEmpty)
                                Text(_formatTime(queuedAt), style: GoogleFonts.dmSans(fontSize: 11, color: const Color(0xFF9CA3AF))),
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
                    borderRadius: BorderRadius.only(bottomLeft: Radius.circular(12), bottomRight: Radius.circular(12)),
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: syncing ? null : onSync,
                      icon: syncing
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.sync_rounded, size: 16),
                      label: Text(syncing ? 'Syncing…' : 'Sync ${queue.length} Item${queue.length == 1 ? '' : 's'} Now',
                          style: GoogleFonts.dmSans(fontSize: 13, fontWeight: FontWeight.w700)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFD97706),
                        foregroundColor: Colors.white,
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
