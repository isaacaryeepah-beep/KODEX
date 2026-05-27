import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class ManagerReportsScreen extends StatefulWidget {
  const ManagerReportsScreen({super.key});

  @override
  State<ManagerReportsScreen> createState() => _ManagerReportsScreenState();
}

class _ManagerReportsScreenState extends State<ManagerReportsScreen> {
  Map<String, dynamic>? _reports;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await apiService.getReports();
      setState(() { _reports = data; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: DiklyColors.textSecondary)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          DiklyScreenHeader(
            title: 'Reports',
            subtitle: 'Team analytics overview',
          ),
          Text(
            'Team Statistics',
            style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
          ),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              _StatTile(label: 'Total Employees', value: (_reports?['totalEmployees'] ?? '—').toString(), icon: Icons.people_outlined, color: const Color(0xFF059669)),
              _StatTile(label: 'Present Today', value: (_reports?['presentToday'] ?? '—').toString(), icon: Icons.check_circle_outline, color: DiklyColors.success),
              _StatTile(label: 'On Leave', value: (_reports?['onLeave'] ?? '—').toString(), icon: Icons.event_note_outlined, color: DiklyColors.warning),
              _StatTile(label: 'Departments', value: (_reports?['departments'] ?? '—').toString(), icon: Icons.business_outlined, color: DiklyColors.primary),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatTile({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 18, color: color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
              Text(label, style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight, fontWeight: FontWeight.w500)),
            ],
          ),
        ],
      ),
    );
  }
}
