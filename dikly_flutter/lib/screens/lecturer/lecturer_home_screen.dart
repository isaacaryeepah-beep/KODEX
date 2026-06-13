import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _lecturerDashProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getLecturerDashboardData(),
);

class LecturerHomeScreen extends ConsumerWidget {
  const LecturerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final dashAsync = ref.watch(_lecturerDashProvider);
    final firstName = (user?.name ?? 'Lecturer').split(' ').first;
    final dept = user?.department ?? '';

    return RefreshIndicator(
      onRefresh: () async { ref.invalidate(_lecturerDashProvider); },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome back, $firstName',
                      style: GoogleFonts.dmSans(fontSize: 22, fontWeight: FontWeight.w800, color: DiklyColors.text, height: 1.2),
                    ),
                    const SizedBox(height: 4),
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textLight),
                        children: [
                          TextSpan(text: "Here's an overview of your workspace at ${user?.company ?? 'your institution'}"),
                          if (dept.isNotEmpty)
                            TextSpan(text: ' · $dept', style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFD97706))),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          dashAsync.when(
            loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: DiklyColors.primary))),
            error: (e, _) => DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 36, color: DiklyColors.error),
                  const SizedBox(height: 10),
                  const Text('Failed to load dashboard'),
                  const SizedBox(height: 10),
                  TextButton(onPressed: () => ref.invalidate(_lecturerDashProvider), child: const Text('Retry')),
                ],
              ),
            ),
            data: (dash) {
              final totalStudents = dash['totalStudents'] ?? 0;
              final activeCourses = dash['activeCourses'] ?? 0;
              final totalSessions = dash['totalSessions'] ?? 0;
              final quizzesCreated = dash['quizzesCreated'] ?? 0;
              final sessions = (dash['sessions'] as List?) ?? [];
              final upcomingMeetings = (dash['upcomingMeetings'] as List?) ?? [];

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Stats row — 4 compact cards
                  Row(
                    children: [
                      _StatCard(value: '$totalStudents', label: 'STUDENTS', color: DiklyColors.primary),
                      const SizedBox(width: 8),
                      _StatCard(value: '$activeCourses', label: 'COURSES', color: DiklyColors.success),
                      const SizedBox(width: 8),
                      _StatCard(value: '$totalSessions', label: 'SESSIONS', color: const Color(0xFFF97316)),
                      const SizedBox(width: 8),
                      _StatCard(value: '$quizzesCreated', label: 'QUIZZES', color: const Color(0xFF7C3AED)),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Quick Actions
                  const Text('Quick Actions', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => context.push('/sessions'),
                          icon: const Icon(Icons.play_circle_outline_rounded, size: 16),
                          label: const Text('Start Session'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: DiklyColors.primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            elevation: 0,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => context.push('/courses'),
                          icon: const Icon(Icons.add_circle_outline_rounded, size: 16),
                          label: const Text('Create Course'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: DiklyColors.success,
                            side: const BorderSide(color: DiklyColors.success),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => context.push('/quizzes'),
                          icon: const Icon(Icons.quiz_outlined, size: 16),
                          label: const Text('Create Quiz'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF7C3AED),
                            side: const BorderSide(color: Color(0xFF7C3AED)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Recent Sessions table
                  const Text('Recent Sessions', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                  const SizedBox(height: 8),
                  sessions.isEmpty
                      ? Container(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: DiklyColors.border),
                          ),
                          child: const Center(
                            child: Text('No sessions yet.', style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                          ),
                        )
                      : DiklyCard(
                          padding: EdgeInsets.zero,
                          child: Column(
                            children: [
                              // Table header
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                decoration: const BoxDecoration(
                                  color: Color(0xFFF9FAFB),
                                  borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
                                  border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5)),
                                ),
                                child: const Row(children: [
                                  Expanded(flex: 3, child: _TableHeader('TITLE')),
                                  Expanded(flex: 2, child: _TableHeader('STATUS')),
                                  Expanded(flex: 3, child: _TableHeader('STARTED')),
                                  Expanded(flex: 2, child: _TableHeader('CREATED BY')),
                                ]),
                              ),
                              ...sessions.take(5).map<Widget>((s) => _SessionRow(s: s as Map)),
                            ],
                          ),
                        ),
                  const SizedBox(height: 24),

                  // Scheduled Meetings
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Scheduled Meetings', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                          const Text('Upcoming and live Jitsi meetings', style: TextStyle(fontSize: 12, color: DiklyColors.textLight)),
                        ],
                      ),
                      TextButton.icon(
                        onPressed: () => context.push('/meetings'),
                        icon: const Icon(Icons.calendar_today_outlined, size: 14),
                        label: const Text('View All', style: TextStyle(fontSize: 13)),
                        style: TextButton.styleFrom(foregroundColor: DiklyColors.primary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  upcomingMeetings.isEmpty
                      ? DiklyCard(
                          padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
                          child: Column(
                            children: [
                              const Icon(Icons.calendar_today_outlined, size: 36, color: DiklyColors.textMuted),
                              const SizedBox(height: 10),
                              const Text('No upcoming meetings', style: TextStyle(color: DiklyColors.textLight)),
                              const SizedBox(height: 10),
                              OutlinedButton(
                                onPressed: () => context.push('/meetings'),
                                style: OutlinedButton.styleFrom(foregroundColor: DiklyColors.primary, side: const BorderSide(color: DiklyColors.primary), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                                child: const Text('Schedule a Meeting'),
                              ),
                            ],
                          ),
                        )
                      : DiklyCard(
                          padding: EdgeInsets.zero,
                          child: Column(
                            children: upcomingMeetings.map<Widget>((m) => _MeetingRow(m: m as Map)).toList(),
                          ),
                        ),
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;

  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 8),
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            Text(label, style: const TextStyle(fontSize: 8, color: Color(0xFF9CA3AF), letterSpacing: 0.2)),
          ],
        ),
      ),
    );
  }
}

class _TableHeader extends StatelessWidget {
  final String text;
  const _TableHeader(this.text);
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF9CA3AF)),
  );
}

class _SessionRow extends StatelessWidget {
  final Map s;
  const _SessionRow({required this.s});

  @override
  Widget build(BuildContext context) {
    final title = s['title']?.toString() ?? 'Untitled';
    final status = s['status']?.toString() ?? '';
    final statusColor = status == 'active' || status == 'live' ? DiklyColors.success
        : status == 'paused' || status == 'locked' ? DiklyColors.warning
        : DiklyColors.textLight;
    final startedAt = s['startedAt'] != null ? DateTime.tryParse(s['startedAt'].toString()) : null;
    final creatorName = (s['createdBy'] as Map?)?['name']?.toString() ?? '—';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5))),
      child: Row(
        children: [
          Expanded(flex: 3, child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis)),
          Expanded(
            flex: 2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(4)),
              child: Text(status, style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.w600)),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              startedAt != null ? DateFormat('M/d/yyyy, h:mm a').format(startedAt) : '—',
              style: const TextStyle(fontSize: 11, color: DiklyColors.textLight),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(flex: 2, child: Text(creatorName, style: const TextStyle(fontSize: 11, color: DiklyColors.textLight), maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

class _MeetingRow extends StatelessWidget {
  final Map m;
  const _MeetingRow({required this.m});

  @override
  Widget build(BuildContext context) {
    final status = m['status']?.toString() ?? '';
    final isLive = status == 'live';
    final scheduledStart = m['scheduledStart'] != null ? DateTime.tryParse(m['scheduledStart'].toString()) : null;
    final scheduledEnd = m['scheduledEnd'] != null ? DateTime.tryParse(m['scheduledEnd'].toString()) : null;
    final now = DateTime.now();

    String statusLabel;
    Color statusColor;
    if (isLive) {
      statusLabel = 'LIVE';
      statusColor = DiklyColors.success;
    } else if (scheduledStart != null) {
      final diff = scheduledStart.difference(now);
      if (diff.isNegative) {
        statusLabel = 'OVERDUE';
        statusColor = DiklyColors.error;
      } else if (diff.inHours < 1) {
        statusLabel = 'IN ${diff.inMinutes}m';
        statusColor = DiklyColors.warning;
      } else if (diff.inHours < 24) {
        statusLabel = 'IN ${diff.inHours}h';
        statusColor = const Color(0xFF0891B2);
      } else {
        statusLabel = 'SCHEDULED';
        statusColor = DiklyColors.textLight;
      }
    } else {
      statusLabel = 'SCHEDULED';
      statusColor = DiklyColors.textLight;
    }

    final timeStr = scheduledStart != null
        ? DateFormat('EEE, MMM d · h:mm a').format(scheduledStart) +
            (scheduledEnd != null ? ' – ${DateFormat('h:mm a').format(scheduledEnd)}' : '')
        : '';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5))),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 40,
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(color: statusColor, borderRadius: BorderRadius.circular(2)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m['title']?.toString() ?? 'Untitled Meeting', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: DiklyColors.text), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (timeStr.isNotEmpty)
                  Text(timeStr, style: const TextStyle(fontSize: 12, color: DiklyColors.textLight)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
            child: Text(statusLabel, style: TextStyle(fontSize: 10, color: statusColor, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
