import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _studentPerformanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getPerformance(),
);

final _lecturerPerformanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getLecturerPerformance(),
);

final _corporatePerformanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getCorporatePerformance(),
);

class PerformanceScreen extends ConsumerWidget {
  const PerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final role = user?.role ?? 'student';
    final name = user?.name ?? '';
    final isCorporate = role == 'admin' || role == 'manager' || role == 'employee';
    final isLecturer = role == 'lecturer';

    if (isCorporate) {
      final async = ref.watch(_corporatePerformanceProvider);
      return _buildScaffold(
        context: context,
        body: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(onRetry: () => ref.refresh(_corporatePerformanceProvider)),
          data: (data) => RefreshIndicator(
            onRefresh: () async => ref.refresh(_corporatePerformanceProvider),
            child: _CorporatePerformanceBody(data: data, userName: name),
          ),
        ),
      );
    }

    if (isLecturer) {
      final async = ref.watch(_lecturerPerformanceProvider);
      return _buildScaffold(
        context: context,
        body: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorView(onRetry: () => ref.refresh(_lecturerPerformanceProvider)),
          data: (data) => RefreshIndicator(
            onRefresh: () async => ref.refresh(_lecturerPerformanceProvider),
            child: _AcademicPerformanceBody(data: data, isLecturer: true, userName: name),
          ),
        ),
      );
    }

    final async = ref.watch(_studentPerformanceProvider);
    return _buildScaffold(
      context: context,
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(onRetry: () => ref.refresh(_studentPerformanceProvider)),
        data: (data) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_studentPerformanceProvider),
          child: _AcademicPerformanceBody(data: data, isLecturer: false, userName: name),
        ),
      ),
    );
  }

  Widget _buildScaffold({required BuildContext context, required Widget body}) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('My Performance'),
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: body,
    );
  }
}

// ── Corporate Performance (Employee / Manager) ────────────────────────────────

class _CorporatePerformanceBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final String userName;
  const _CorporatePerformanceBody({required this.data, required this.userName});

  @override
  Widget build(BuildContext context) {
    final attendanceRate = (data['attendanceRate'] as num?)?.toStringAsFixed(0) ?? '0';
    final lateDays = (data['lateDays'] as num?)?.toInt() ?? 0;
    final hoursWorked = (data['hoursWorked'] as num?)?.toStringAsFixed(0) ?? '0';
    final performanceScore = (data['performanceScore'] as num?)?.toStringAsFixed(0);
    final attendanceLogs = data['attendanceLogs'] as List? ?? [];
    final goals = data['goals'] as List? ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'My Performance',
          subtitle: 'Last 90 days · $userName',
        ),

        // ── 4 stat cards ────────────────────────────────────────────────
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.6,
          children: [
            _StatCard(value: '$attendanceRate%', label: 'ATTENDANCE RATE', color: const Color(0xFF2563EB)),
            _StatCard(value: '$lateDays', label: 'LATE DAYS', color: const Color(0xFFD97706)),
            _StatCard(value: '${hoursWorked}h', label: 'HOURS WORKED', color: const Color(0xFF059669)),
            _StatCard(value: performanceScore != null ? '$performanceScore' : '—', label: 'PERFORMANCE SCORE', color: const Color(0xFF7C3AED)),
          ],
        ),
        const SizedBox(height: 16),

        // ── Two trend chart placeholders ─────────────────────────────────
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _TrendCard(
                title: 'Attendance Trend (30 days)',
                hasData: attendanceLogs.isNotEmpty,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _TrendCard(
                title: 'Work Hours Trend (30 days)',
                hasData: false,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // ── Attendance Log ───────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Attendance Log',
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
              const SizedBox(height: 12),
              if (attendanceLogs.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: Text('No attendance records found.',
                        style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                  ),
                )
              else
                ...attendanceLogs.take(10).map((log) => _LogRow(log: log as Map<String, dynamic>)),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── My Goals ─────────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('My Goals',
                        style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
                  ),
                  OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.add, size: 14),
                    label: Text('Add Goal', style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w600)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF2563EB),
                      side: const BorderSide(color: Color(0xFF2563EB)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                    ),
                  ),
                ],
              ),
              if (goals.isEmpty) ...[
                const SizedBox(height: 16),
                Center(
                  child: Text('No goals set yet.',
                      style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

class _TrendCard extends StatelessWidget {
  final String title;
  final bool hasData;
  const _TrendCard({required this.title, required this.hasData});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: GoogleFonts.dmSans(fontSize: 12, fontWeight: FontWeight.w700, color: DiklyColors.text)),
          const SizedBox(height: 20),
          Center(
            child: Text(
              hasData ? '' : 'No data yet.',
              style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

class _LogRow extends StatelessWidget {
  final Map<String, dynamic> log;
  const _LogRow({required this.log});

  @override
  Widget build(BuildContext context) {
    final date = log['date']?.toString() ?? '';
    final status = log['status']?.toString() ?? '';
    Color color;
    switch (status.toLowerCase()) {
      case 'present': color = const Color(0xFF059669); break;
      case 'late': color = const Color(0xFFD97706); break;
      case 'absent': color = const Color(0xFFDC2626); break;
      default: color = const Color(0xFF6B7280);
    }
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: DiklyColors.border))),
      child: Row(
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 10),
          Expanded(child: Text(date, style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.text))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
            child: Text(status.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
          ),
        ],
      ),
    );
  }
}

// ── Academic Performance (Student / Lecturer) ─────────────────────────────────

class _AcademicPerformanceBody extends StatelessWidget {
  final Map<String, dynamic> data;
  final bool isLecturer;
  final String userName;
  const _AcademicPerformanceBody({required this.data, required this.isLecturer, required this.userName});

  @override
  Widget build(BuildContext context) {
    final List<_StatItem> stats = isLecturer ? [
      _StatItem(value: '${(data['totalSessions'] as num?)?.toInt() ?? 0}', label: 'TOTAL SESSIONS', color: const Color(0xFF2563EB)),
      _StatItem(value: '${(data['avgAttendance'] as num?)?.toStringAsFixed(1) ?? '0'}%', label: 'AVG ATTENDANCE', color: const Color(0xFF059669)),
      _StatItem(value: '${(data['coursesActive'] as num?)?.toInt() ?? 0}', label: 'ACTIVE COURSES', color: const Color(0xFFD97706)),
      _StatItem(value: '${(data['studentsFeedbackScore'] as num?)?.toStringAsFixed(1) ?? '—'}/5', label: 'FEEDBACK SCORE', color: const Color(0xFF7C3AED)),
    ] : [
      _StatItem(value: '${(data['attendanceRate'] as num?)?.toStringAsFixed(0) ?? '0'}%', label: 'ATTENDANCE RATE', color: const Color(0xFF2563EB)),
      _StatItem(value: '${(data['assignmentsCompleted'] as num?)?.toInt() ?? 0}', label: 'ASSIGNMENTS DONE', color: const Color(0xFF059669)),
      _StatItem(value: '${(data['averageGrade'] as num?)?.toStringAsFixed(0) ?? '0'}%', label: 'AVERAGE GRADE', color: const Color(0xFFD97706)),
      _StatItem(value: '${(data['sessionsAttended'] as num?)?.toInt() ?? 0}', label: 'SESSIONS ATTENDED', color: const Color(0xFF7C3AED)),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DiklyScreenHeader(
          title: 'My Performance',
          subtitle: 'Last 90 days · $userName',
        ),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.6,
          children: stats.map((s) => _StatCard(value: s.value, label: s.label, color: s.color)).toList(),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: DiklyColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Performance Overview',
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text)),
              const SizedBox(height: 12),
              Center(
                child: Text('No data yet.',
                    style: GoogleFonts.dmSans(fontSize: 13, color: DiklyColors.textMuted)),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

class _StatItem {
  final String value;
  final String label;
  final Color color;
  const _StatItem({required this.value, required this.label, required this.color});
}

class _StatCard extends StatelessWidget {
  final String value;
  final String label;
  final Color color;
  const _StatCard({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value,
              style: GoogleFonts.dmSans(fontSize: 26, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 4),
          Text(label,
              textAlign: TextAlign.center,
              style: GoogleFonts.dmSans(fontSize: 9, fontWeight: FontWeight.w600, color: DiklyColors.textMuted, letterSpacing: 0.6)),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
          const SizedBox(height: 12),
          const Text('Failed to load performance data'),
          const SizedBox(height: 8),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
