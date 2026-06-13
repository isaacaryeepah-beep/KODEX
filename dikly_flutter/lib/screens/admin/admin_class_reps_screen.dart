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
        title: const Text('Class Reps', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_classRepsProvider)),
        data: (reps) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_classRepsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Class Representatives',
                subtitle: '${reps.length} active rep${reps.length == 1 ? '' : 's'} · Max 2 per class group',
                action: ElevatedButton.icon(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Assign New Rep — coming soon')),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.person_add_outlined, size: 16),
                  label: const Text('Assign New Rep', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
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
                DiklyCard(
                  padding: EdgeInsets.zero,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: IntrinsicWidth(
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: const BoxDecoration(
                              color: Color(0xFFF9FAFB),
                              border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB))),
                            ),
                            child: const Row(
                              children: [
                                SizedBox(width: 180, child: Text('NAME', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                                SizedBox(width: 90, child: Text('INDEX NO.', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                                SizedBox(width: 80, child: Text('PROGRAMME', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                                SizedBox(width: 90, child: Text('LEVEL / GROUP', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                                SizedBox(width: 100, child: Text('SESSION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                                SizedBox(width: 120, child: Text('DEPARTMENT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                                SizedBox(width: 120, child: Text('DEVICE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF), letterSpacing: 0.5))),
                              ],
                            ),
                          ),
                          ...reps.map((r) => _RepRow(rep: r)),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RepRow extends StatelessWidget {
  final Map<String, dynamic> rep;
  const _RepRow({required this.rep});

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
    final deviceId = rep['deviceId']?.toString() ?? rep['device']?.toString() ?? '—';
    final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFE5E7EB), width: 0.5))),
      child: Row(
        children: [
          SizedBox(
            width: 180,
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: const Color(0xFF2563EB).withOpacity(0.1),
                  child: Text(initials, style: const TextStyle(color: Color(0xFF2563EB), fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF111827)), overflow: TextOverflow.ellipsis),
                      if (email.isNotEmpty) Text(email, style: const TextStyle(fontSize: 10, color: Color(0xFF6B7280)), overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SizedBox(width: 90, child: Text(index, style: const TextStyle(fontSize: 12, color: Color(0xFF374151)))),
          SizedBox(width: 80, child: Text(programme, style: const TextStyle(fontSize: 12, color: Color(0xFF374151)), overflow: TextOverflow.ellipsis)),
          SizedBox(
            width: 90,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('L$level', style: const TextStyle(fontSize: 11, color: Color(0xFF374151))),
                Text('Grp $group', style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF))),
              ],
            ),
          ),
          SizedBox(width: 100, child: Text(session, style: const TextStyle(fontSize: 11, color: Color(0xFF374151)), overflow: TextOverflow.ellipsis)),
          SizedBox(width: 120, child: Text(dept, style: const TextStyle(fontSize: 11, color: Color(0xFF374151)), overflow: TextOverflow.ellipsis)),
          SizedBox(width: 120, child: Text(deviceId, style: const TextStyle(fontSize: 11, color: Color(0xFF374151)), overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}
