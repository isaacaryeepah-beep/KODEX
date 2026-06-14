import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('About'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          const Text(
            'About DIKLY',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 4),
          const Text(
            'Smart Attendance & Academic Management',
            style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
          ),
          const SizedBox(height: 20),

          // App info card
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: Column(
              children: [
                // App icon
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: DiklyColors.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(Icons.check_box_outlined, color: Colors.white, size: 40),
                ),
                const SizedBox(height: 16),
                const Text(
                  'DIKLY',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
                ),
                const SizedBox(height: 4),
                const Text(
                  'by DIKLY Technologies',
                  style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: DiklyColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: DiklyColors.primary.withOpacity(0.3)),
                  ),
                  child: const Text(
                    'Version 1.0.0',
                    style: TextStyle(fontSize: 12, color: DiklyColors.primary, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'DIKLY is an all-in-one smart attendance and academic management platform built for universities, colleges, and corporate organisations across Africa. We make attendance effortless, assessments secure, and institutional operations transparent.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF374151), height: 1.6),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // What DIKLY Offers
          const Text(
            'What DIKLY Offers',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 12),
          ..._offers.map((o) => _OfferCard(icon: o.$1, title: o.$2, desc: o.$3)),

          const SizedBox(height: 24),

          // ── Download section ────────────────────────────────────────
          const Text(
            'Download DIKLY',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 4),
          const Text(
            'Get the app on other platforms',
            style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
          ),
          const SizedBox(height: 12),
          _DownloadCard(
            icon: Icons.android_rounded,
            iconColor: const Color(0xFF16A34A),
            iconBg: const Color(0xFFDCFCE7),
            label: 'Android APK',
            note: 'Latest build — installs over existing app',
            url: 'https://github.com/isaacaryeepah-beep/Dikly_releases/releases/download/flutter-latest/dikly-flutter.apk',
          ),
          _DownloadCard(
            icon: Icons.desktop_windows_outlined,
            iconColor: const Color(0xFF2563EB),
            iconBg: const Color(0xFFEFF6FF),
            label: 'Windows Installer',
            note: 'dikly-windows-setup.exe — Windows 10 / 11',
            url: 'https://github.com/isaacaryeepah-beep/Dikly_releases/releases/download/windows-latest/dikly-windows-setup.exe',
          ),
          _DownloadCard(
            icon: Icons.laptop_mac_outlined,
            iconColor: const Color(0xFF7C3AED),
            iconBg: const Color(0xFFF5F3FF),
            label: 'macOS DMG',
            note: 'dikly-mac.dmg — macOS 11+',
            url: 'https://github.com/isaacaryeepah-beep/Dikly_releases/releases/download/mac-latest/dikly-mac.dmg',
          ),
          const SizedBox(height: 8),
          const Center(
            child: Text(
              '📱 iOS — App Store coming soon',
              style: TextStyle(fontSize: 12, color: Color(0xFF9CA3AF)),
            ),
          ),
        ],
      ),
    );
  }
}

const _offers = [
  (Icons.check_circle_outline, 'Smart Attendance', 'ESP32 BLE + WiFi proximity attendance tracking with fraud prevention'),
  (Icons.quiz_outlined, 'Proctored Quizzes', 'AI-monitored snap quizzes and assessments for academic integrity'),
  (Icons.video_call_outlined, 'Video Meetings', 'Integrated GetStream video meetings with recording support'),
  (Icons.grade_outlined, 'Grade Book', 'Comprehensive grading and academic performance tracking'),
  (Icons.people_outlined, 'Multi-role Portal', 'Student, lecturer, HOD, admin, manager, and employee portals'),
];

class _DownloadCard extends StatelessWidget {
  final IconData icon;
  final Color iconColor, iconBg;
  final String label, note, url;

  const _DownloadCard({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.label,
    required this.note,
    required this.url,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        title: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
        subtitle: Text(note, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
        trailing: Icon(Icons.download_rounded, color: iconColor, size: 20),
        onTap: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String desc;
  const _OfferCard({required this.icon, required this.title, required this.desc});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: DiklyColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: DiklyColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                const SizedBox(height: 2),
                Text(desc, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
