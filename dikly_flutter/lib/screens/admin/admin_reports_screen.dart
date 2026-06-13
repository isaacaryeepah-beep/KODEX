import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminReportsScreen extends StatelessWidget {
  const AdminReportsScreen({super.key});

  static const _cards = [
    _ReportCard(
      gradient: [Color(0xFF4F46E5), Color(0xFF6366F1)],
      icon: Icons.table_chart_outlined,
      title: 'Institution Summary',
      desc: 'Complete overview: users, attendance, subscription, and academic data',
      type: 'summary',
    ),
    _ReportCard(
      gradient: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
      icon: Icons.checklist_outlined,
      title: 'Attendance Overview',
      desc: 'Institution-wide attendance with per-session breakdown and individual records',
      type: 'attendance',
    ),
    _ReportCard(
      gradient: [Color(0xFF0EA5E9), Color(0xFF06B6D4)],
      icon: Icons.timer_outlined,
      title: 'Session Report',
      desc: 'Duration tracking, attendee counts, and suspicious session flagging',
      type: 'sessions',
    ),
    _ReportCard(
      gradient: [Color(0xFF8B5CF6), Color(0xFFA78BFA)],
      icon: Icons.bar_chart_outlined,
      title: 'Performance Report',
      desc: 'Quiz analytics: per-course scores, pass rates, and all submissions',
      type: 'performance',
    ),
    _ReportCard(
      gradient: [Color(0xFF10B981), Color(0xFF059669)],
      icon: Icons.people_outlined,
      title: 'Lecturer Performance',
      desc: 'Compare lecturers: sessions, courses, student engagement, and records',
      type: 'lecturers',
    ),
    _ReportCard(
      gradient: [Color(0xFFF59E0B), Color(0xFFF97316)],
      icon: Icons.school_outlined,
      title: 'Student Analytics',
      desc: 'Attendance rates, course enrollments, and quiz score averages',
      type: 'students',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        DiklyScreenHeader(
          title: 'Admin Reports',
          subtitle: 'Full institution analytics — tap any card to download as PDF',
        ),
        const SizedBox(height: 4),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 0.78,
          ),
          itemCount: _cards.length,
          itemBuilder: (ctx, i) => _ReportCardWidget(card: _cards[i]),
        ),
      ],
    );
  }
}

class _ReportCard {
  final List<Color> gradient;
  final IconData icon;
  final String title;
  final String desc;
  final String type;

  const _ReportCard({
    required this.gradient,
    required this.icon,
    required this.title,
    required this.desc,
    required this.type,
  });
}

class _ReportCardWidget extends StatefulWidget {
  final _ReportCard card;
  const _ReportCardWidget({required this.card});

  @override
  State<_ReportCardWidget> createState() => _ReportCardWidgetState();
}

class _ReportCardWidgetState extends State<_ReportCardWidget> {
  bool _loading = false;

  Future<void> _download() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final url = await apiService.getReportDownloadLink(widget.card.type, isAdmin: true);
      final uri = Uri.parse(url);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw Exception('Could not open PDF');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to download: ${e.toString()}'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final card = widget.card;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: card.gradient,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: card.gradient.first.withOpacity(0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: _download,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(card.icon, color: Colors.white, size: 24),
                ),
                const SizedBox(height: 12),
                Text(
                  card.title,
                  style: GoogleFonts.dmSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: Text(
                    card.desc,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.white70,
                      height: 1.4,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: _loading
                      ? const Center(
                          child: SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.download_outlined, size: 14, color: Colors.white),
                            const SizedBox(width: 6),
                            Text(
                              'Download PDF',
                              style: GoogleFonts.dmSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
