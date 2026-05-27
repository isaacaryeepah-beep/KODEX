import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme.dart';

// ── Static report types ───────────────────────────────────────────────────────

class _ReportType {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final String endpoint;

  const _ReportType({
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.endpoint,
  });
}

const _reports = [
  _ReportType(
    title: 'Attendance Report',
    description: 'All attendance records across your sessions',
    icon: Icons.check_box_outlined,
    color: Color(0xFF7C3AED),
    endpoint: '/reports/attendance/pdf',
  ),
  _ReportType(
    title: 'Sessions Report',
    description: 'Summary of your attendance sessions',
    icon: Icons.access_time_rounded,
    color: Color(0xFF0EA5E9),
    endpoint: '/reports/sessions/pdf',
  ),
  _ReportType(
    title: 'Performance Report',
    description: 'Grades and performance across all courses',
    icon: Icons.bar_chart_rounded,
    color: Color(0xFFF97316),
    endpoint: '/reports/performance/pdf',
  ),
  _ReportType(
    title: 'Grade Report',
    description: 'Full grade book export for your courses',
    icon: Icons.grade_rounded,
    color: Color(0xFF16A34A),
    endpoint: '/reports/grades/pdf',
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class ReportsScreen extends StatelessWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Reports'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // ── Header ────────────────────────────────────────────────────
          const Text(
            'Reports',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 4),
          const Text(
            'Download reports as PDF with one click',
            style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
          ),
          const SizedBox(height: 20),

          // ── Report cards ──────────────────────────────────────────────
          for (final report in _reports)
            _ReportCard(report: report),
        ],
      ),
    );
  }
}

// ── Report Card ───────────────────────────────────────────────────────────────

class _ReportCard extends StatefulWidget {
  final _ReportType report;
  const _ReportCard({required this.report});

  @override
  State<_ReportCard> createState() => _ReportCardState();
}

class _ReportCardState extends State<_ReportCard> {
  bool _downloading = false;

  Future<void> _download() async {
    setState(() => _downloading = true);
    try {
      final uri = Uri.parse('https://dikly.sbs${widget.report.endpoint}');
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open report. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.report;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border(top: BorderSide(color: r.color, width: 3)),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: [
          // Icon
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: r.color,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(r.icon, color: Colors.white, size: 30),
          ),
          const SizedBox(height: 14),

          // Title
          Text(
            r.title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 6),

          // Description
          Text(
            r.description,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.4),
          ),
          const SizedBox(height: 18),

          // Download button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _downloading ? null : _download,
              icon: _downloading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.download_rounded, size: 18),
              label: Text(_downloading ? 'Opening...' : 'Download PDF'),
              style: ElevatedButton.styleFrom(
                backgroundColor: r.color,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                elevation: 0,
                textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
