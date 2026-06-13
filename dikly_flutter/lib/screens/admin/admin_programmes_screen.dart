import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _programmesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getProgrammes(),
);

class AdminProgrammesScreen extends ConsumerStatefulWidget {
  const AdminProgrammesScreen({super.key});

  @override
  ConsumerState<AdminProgrammesScreen> createState() => _AdminProgrammesScreenState();
}

class _AdminProgrammesScreenState extends ConsumerState<AdminProgrammesScreen> {
  void _showCreateDialog() {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('New Programme', style: TextStyle(fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Programme Name')),
          const SizedBox(height: 10),
          TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description'), maxLines: 2),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2563EB)),
            onPressed: () async {
              Navigator.pop(context);
              try {
                await apiService.createProgramme({
                  'name': nameCtrl.text.trim(),
                  'description': descCtrl.text.trim(),
                });
                ref.invalidate(_programmesProvider);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Programme created!'), backgroundColor: DiklyColors.success),
                );
              } catch (e) {
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error),
                );
              }
            },
            child: const Text('Create', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_programmesProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Programmes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_programmesProvider)),
        data: (programmes) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_programmesProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Programmes',
                subtitle: 'Academic programmes and courses offered by your institution',
                action: ElevatedButton.icon(
                  onPressed: _showCreateDialog,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('+ New Programme', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ),
              ),
              if (programmes.isEmpty)
                DiklyCard(
                  padding: const EdgeInsets.all(32),
                  child: const Center(
                    child: Text(
                      'No programmes found. Add the first one with the button above.',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                ...programmes.map((p) => _ProgrammeCard(programme: p)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProgrammeCard extends StatelessWidget {
  final Map<String, dynamic> programme;
  const _ProgrammeCard({required this.programme});

  @override
  Widget build(BuildContext context) {
    final name = programme['name']?.toString() ?? programme['title']?.toString() ?? 'Unnamed';
    final desc = programme['description']?.toString() ?? '';
    final courseCount = programme['courseCount'] ?? programme['requirements']?.length ?? 0;
    final studentCount = programme['studentCount'] ?? 0;

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: const Color(0xFF2563EB).withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.school_outlined, color: Color(0xFF2563EB), size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF111827))),
                if (desc.isNotEmpty)
                  Text(desc, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('$courseCount courses · $studentCount students',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF), size: 18),
        ],
      ),
    );
  }
}
