import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _devicesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getAdminDevices(),
);

class AdminDevicesScreen extends ConsumerWidget {
  const AdminDevicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final instCode = user?.institutionCode ?? '';
    final devicesAsync = ref.watch(_devicesProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Classroom Devices'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_devicesProvider),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Purple banner header
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.devices_outlined, color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Classroom Devices', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                        SizedBox(height: 2),
                        Text('Manage and provision ESP32 attendance devices', style: TextStyle(fontSize: 12, color: Colors.white70)),
                      ],
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Generate Pairing Code — coming soon')),
                    ),
                    icon: const Icon(Icons.add, size: 14),
                    label: const Text('Generate Pairing Code', style: TextStyle(fontSize: 11)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFF7C3AED),
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Institution code card
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('INSTITUTION CODE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: DiklyColors.textLight, letterSpacing: 0.5)),
                        const SizedBox(height: 6),
                        Text(instCode.isEmpty ? '—' : instCode, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, letterSpacing: 2)),
                        const SizedBox(height: 6),
                        const Text("Class Rep needs this + a pairing code to set up a device. Keep it confidential.", style: TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                        if (instCode.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          GestureDetector(
                            onTap: () {
                              Clipboard.setData(ClipboardData(text: instCode));
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Code copied!')));
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(color: DiklyColors.grey100, borderRadius: BorderRadius.circular(6), border: Border.all(color: DiklyColors.border)),
                              child: const Text('Copy', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.textSecondary)),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.shield_outlined, size: 28, color: DiklyColors.textSecondary),
                        SizedBox(height: 8),
                        Text('Device pairing is secure', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                        SizedBox(height: 4),
                        Text('JWT authenticated · Company-isolated', style: TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Paired devices
            devicesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: DiklyColors.border),
                ),
                child: Column(
                  children: [
                    const Text('Paired Devices', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                    const SizedBox(height: 12),
                    const Text('Could not load devices.', style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                    const SizedBox(height: 8),
                    TextButton(onPressed: () => ref.invalidate(_devicesProvider), child: const Text('Retry')),
                  ],
                ),
              ),
              data: (devices) => Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: DiklyColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
                      child: Row(
                        children: [
                          Text('Paired Devices ${devices.length}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                          const Spacer(),
                          GestureDetector(
                            onTap: () => ref.invalidate(_devicesProvider),
                            child: const Row(
                              children: [
                                Icon(Icons.refresh, size: 14, color: DiklyColors.textSecondary),
                                SizedBox(width: 4),
                                Text('Refresh', style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1, color: DiklyColors.border),
                    if (devices.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(
                          child: Text('No paired devices yet.', style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                        ),
                      )
                    else
                      ...devices.map((d) => _DeviceCard(device: d, onRefresh: () => ref.invalidate(_devicesProvider))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _DeviceCard extends StatelessWidget {
  final Map<String, dynamic> device;
  final VoidCallback onRefresh;

  const _DeviceCard({required this.device, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final name = device['name']?.toString() ?? 'Unknown Device';
    final status = device['status']?.toString() ?? 'offline';
    final serial = device['serial']?.toString() ?? '';
    final ip = device['ip']?.toString() ?? '';
    final firmware = device['firmware']?.toString() ?? '';
    final lastSeen = device['lastSeen']?.toString() ?? '';
    final isOnline = status == 'online';
    final statusColor = isOnline ? DiklyColors.success : DiklyColors.textSecondary;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: DiklyColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: DiklyColors.grey100, borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.device_hub_outlined, size: 18, color: DiklyColors.textSecondary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text)),
                    if (serial.isNotEmpty)
                      Text(serial, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                child: Text(
                  isOnline ? 'Online' : 'Offline',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: statusColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _ActionChip('Rename', Icons.edit_outlined, () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rename — coming soon')))),
                const SizedBox(width: 6),
                _ActionChip('Setup', Icons.settings_outlined, () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Setup — coming soon')))),
                const SizedBox(width: 6),
                _ActionChip('Factory Reset', Icons.restore_outlined, () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Factory Reset — coming soon')))),
                const SizedBox(width: 6),
                _ActionChip('Remove', Icons.delete_outline, () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Remove — coming soon'))), color: DiklyColors.error),
              ],
            ),
          ),
          if (ip.isNotEmpty || firmware.isNotEmpty || lastSeen.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              children: [
                if (ip.isNotEmpty) Text('IP: $ip', style: const TextStyle(fontSize: 10, color: DiklyColors.textLight)),
                if (firmware.isNotEmpty) Text('fw: $firmware', style: const TextStyle(fontSize: 10, color: DiklyColors.textLight)),
                if (lastSeen.isNotEmpty) Text('Last seen: $lastSeen', style: const TextStyle(fontSize: 10, color: DiklyColors.textLight)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color? color;

  const _ActionChip(this.label, this.icon, this.onTap, {this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? DiklyColors.textSecondary;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: c.withOpacity(0.08),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: c.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: c),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c)),
          ],
        ),
      ),
    );
  }
}
