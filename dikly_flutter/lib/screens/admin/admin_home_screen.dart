import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

class AdminHomeScreen extends ConsumerStatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  ConsumerState<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends ConsumerState<AdminHomeScreen> {
  Map<String, dynamic>? _reports;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await apiService.getReports();
      setState(() { _reports = data; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _AdminCard(name: user?.name ?? 'Admin', role: user?.role ?? 'admin'),
          const SizedBox(height: 20),
          const Text('Platform Overview', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              children: [
                StatCard(title: 'Total Users', value: (_reports?['totalUsers'] ?? '—').toString(), icon: Icons.people_outlined, color: const Color(0xFFDC2626)),
                StatCard(title: 'Active Meetings', value: (_reports?['activeMeetings'] ?? '—').toString(), icon: Icons.video_call_outlined, color: DiklyColors.success),
                StatCard(title: 'Courses', value: (_reports?['totalCourses'] ?? '—').toString(), icon: Icons.book_outlined, color: DiklyColors.primary),
                StatCard(title: 'Lecturers', value: (_reports?['totalLecturers'] ?? '—').toString(), icon: Icons.cast_for_education_outlined, color: const Color(0xFF7C3AED)),
              ],
            ),
        ],
      ),
    );
  }
}

class _AdminCard extends StatelessWidget {
  final String name, role;
  const _AdminCard({required this.name, required this.role});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFDC2626), Color(0xFF7C3AED)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: const Color(0xFFDC2626).withOpacity(0.25), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${role == 'hod' ? 'HOD' : 'Admin'} Portal', style: const TextStyle(color: Colors.white70, fontSize: 12, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text(name.split(' ').first, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
        ])),
        const Icon(Icons.admin_panel_settings, color: Colors.white60, size: 40),
      ]),
    );
  }
}
