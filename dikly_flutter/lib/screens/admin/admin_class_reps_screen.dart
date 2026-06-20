import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _classRepsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getClassReps(),
);

class AdminClassRepsScreen extends ConsumerWidget {
  const AdminClassRepsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_classRepsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text(
          'Class Reps',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Assign New Rep — coming soon')),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              icon: const Icon(Icons.person_add_outlined, size: 15),
              label: const Text('Assign', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(_classRepsProvider),
        ),
        data: (reps) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_classRepsProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              // Summary banner
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF2563EB).withOpacity(0.15)),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2563EB).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.groups_outlined, color: Color(0xFF2563EB), size: 18),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${reps.length} Active Rep${reps.length == 1 ? '' : 's'}',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF1E40AF),
                          ),
                        ),
                        const Text(
                          'Max 2 representatives per class group',
                          style: TextStyle(fontSize: 11, color: Color(0xFF3B82F6)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              if (reps.isEmpty)
                DiklyEmptyState(
                  icon: Icons.people_outline,
                  title: 'No class reps assigned yet',
                  subtitle: 'Use "Assign New Rep" to browse students and appoint up to 2 reps per class group.',
                  buttonLabel: 'Assign New Rep',
                  onButton: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Assign New Rep — coming soon')),
                  ),
                )
              else
                ...reps.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _RepCard(rep: r),
                )),
            ],
          ),
        ),
      ),
    );
  }
}

class _RepCard extends StatelessWidget {
  final Map<String, dynamic> rep;
  const _RepCard({required this.rep});

  @override
  Widget build(BuildContext context) {
    final user = rep['userId'] is Map ? rep['userId'] as Map : rep;
    final name = user['name']?.toString() ?? rep['name']?.toString() ?? 'Unknown';
    final email = user['email']?.toString() ?? rep['email']?.toString() ?? '';
    final index = user['IndexNumber']?.toString() ?? rep['IndexNumber']?.toString() ?? '—';
    final programme = rep['programme']?.toString() ?? user['programme']?.toString() ?? '—';
    final level = rep['level']?.toString() ?? '—';
    final group = rep['group']?.toString() ?? '—';
    final session = rep['session']?.toString() ?? user['session']?.toString() ?? '—';
    final dept = user['department']?.toString() ?? rep['department']?.toString() ?? '—';
    final deviceId = rep['deviceId']?.toString() ?? rep['device']?.toString();
    final hasDevice = deviceId != null && deviceId.isNotEmpty && deviceId != 'null';
    final initials = name.split(' ').where((p) => p.isNotEmpty).take(2).map((p) => p[0].toUpperCase()).join();

    // Deterministic avatar colour from name
    final colours = [
      const Color(0xFF2563EB),
      const Color(0xFF7C3AED),
      const Color(0xFF059669),
      const Color(0xFFDC2626),
      const Color(0xFFD97706),
      const Color(0xFF0891B2),
    ];
    final avatarColour = colours[name.codeUnits.fold(0, (a, b) => a + b) % colours.length];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Top: avatar + name + badges ──────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: avatarColour.withOpacity(0.12),
                  child: Text(
                    initials.isEmpty ? '?' : initials,
                    style: TextStyle(
                      color: avatarColour,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF111827),
                        ),
                      ),
                      if (email.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          email,
                          style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 8),
                      // Index + Programme badges
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _Badge(label: index, icon: Icons.badge_outlined, colour: const Color(0xFF2563EB)),
                          _Badge(label: programme, icon: Icons.school_outlined, colour: const Color(0xFF7C3AED)),
                        ],
                      ),
                    ],
                  ),
                ),
                // CR badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2563EB).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'CR',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF2563EB),
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Divider ───────────────────────────────────────────────────────
          const Divider(height: 1, color: Color(0xFFF3F4F6)),

          // ── Detail grid ───────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Wrap(
              spacing: 12,
              runSpacing: 10,
              children: [
                _InfoTile(label: 'Level', value: level == '—' ? '—' : 'Level $level'),
                _InfoTile(label: 'Group', value: group == '—' ? '—' : 'Group $group'),
                _InfoTile(label: 'Session', value: session),
                _InfoTile(label: 'Department', value: dept),
              ],
            ),
          ),

          // ── Device row ────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
            decoration: BoxDecoration(
              color: hasDevice
                  ? const Color(0xFF059669).withOpacity(0.05)
                  : const Color(0xFF6B7280).withOpacity(0.05),
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(14),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  hasDevice ? Icons.devices_outlined : Icons.device_unknown_outlined,
                  size: 14,
                  color: hasDevice ? const Color(0xFF059669) : const Color(0xFF9CA3AF),
                ),
                const SizedBox(width: 6),
                Text(
                  'Device: ',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: hasDevice ? const Color(0xFF059669) : const Color(0xFF9CA3AF),
                  ),
                ),
                Expanded(
                  child: Text(
                    hasDevice ? deviceId! : 'No device assigned',
                    style: TextStyle(
                      fontSize: 11,
                      color: hasDevice ? const Color(0xFF059669) : const Color(0xFF9CA3AF),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (hasDevice)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF059669).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'LINKED',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF059669),
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color colour;
  const _Badge({required this.label, required this.icon, required this.colour});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colour.withOpacity(0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: colour.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: colour),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: colour),
          ),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  final String label;
  final String value;
  const _InfoTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: (MediaQuery.of(context).size.width - 56) / 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: Color(0xFF9CA3AF),
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF1F2937)),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
