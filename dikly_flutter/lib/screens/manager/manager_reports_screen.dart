import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

class ManagerReportsScreen extends StatefulWidget {
  const ManagerReportsScreen({super.key});

  @override
  State<ManagerReportsScreen> createState() => _ManagerReportsScreenState();
}

class _ManagerReportsScreenState extends State<ManagerReportsScreen> {
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
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Reports & Analytics', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  children: [
                    StatCard(title: 'Total Employees', value: (_reports?['totalEmployees'] ?? '—').toString(), icon: Icons.people_outlined, color: const Color(0xFF059669)),
                    StatCard(title: 'Present Today', value: (_reports?['presentToday'] ?? '—').toString(), icon: Icons.check_circle_outline, color: DiklyColors.success),
                    StatCard(title: 'On Leave', value: (_reports?['onLeave'] ?? '—').toString(), icon: Icons.event_note_outlined, color: DiklyColors.warning),
                    StatCard(title: 'Departments', value: (_reports?['departments'] ?? '—').toString(), icon: Icons.business_outlined, color: DiklyColors.primary),
                  ],
                ),
              ],
            ),
    );
  }
}
