import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/assignment.dart';
import '../../widgets/ds/dikly_ds.dart';

class GradeBookScreen extends ConsumerStatefulWidget {
  const GradeBookScreen({super.key});

  @override
  ConsumerState<GradeBookScreen> createState() => _GradeBookScreenState();
}

class _GradeBookScreenState extends ConsumerState<GradeBookScreen> {
  List<Assignment> _assignments = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final assignments = await apiService.getAssignments();
      setState(() { _assignments = assignments; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  List<Assignment> get _graded => _assignments.where((a) => a.grade != null).toList();

  double get _average {
    if (_graded.isEmpty) return 0;
    final sum = _graded.fold(0.0, (acc, a) {
      if (a.totalMarks != null && a.totalMarks! > 0) {
        return acc + (a.grade! / a.totalMarks! * 100);
      }
      return acc;
    });
    return sum / _graded.length;
  }

  Color _gradeColor(double pct) {
    if (pct >= 70) return DiklyColors.success;
    if (pct >= 50) return DiklyColors.warning;
    return DiklyColors.error;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isStudent = user?.role == 'student';

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text(
          'Grade Book',
          style: GoogleFonts.dmSans(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.text),
        ),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: DiklyColors.border),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                      const SizedBox(height: 12),
                      Text(_error!, style: GoogleFonts.dmSans(color: DiklyColors.textSecondary)),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                      DiklyScreenHeader(
                        title: 'Grade Book',
                        subtitle: '${_assignments.length} assignment${_assignments.length == 1 ? '' : 's'}',
                      ),

                      // Summary section (student only)
                      if (isStudent && _graded.isNotEmpty) ...[
                        GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 1.6,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            _StatTile(
                              label: 'Average Score',
                              value: '${_average.toStringAsFixed(1)}%',
                              icon: Icons.grade_rounded,
                              color: _gradeColor(_average),
                            ),
                            _StatTile(
                              label: 'Graded',
                              value: '${_graded.length}/${_assignments.length}',
                              icon: Icons.assignment_turned_in_outlined,
                              color: DiklyColors.primary,
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Progress bar card
                        DiklyCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Overall Performance',
                                    style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.text),
                                  ),
                                  Text(
                                    '${_average.toStringAsFixed(1)}%',
                                    style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w700, color: _gradeColor(_average)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: _average / 100,
                                  backgroundColor: DiklyColors.border,
                                  valueColor: AlwaysStoppedAnimation<Color>(_gradeColor(_average)),
                                  minHeight: 8,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _average >= 70 ? 'Excellent performance!' : _average >= 50 ? 'Good, keep improving!' : 'Needs improvement',
                                style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      Text(
                        'Assignment Grades',
                        style: GoogleFonts.dmSans(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                      ),
                      const SizedBox(height: 12),

                      if (_assignments.isEmpty)
                        const DiklyEmptyState(
                          icon: Icons.grade_outlined,
                          title: 'No assignments',
                          subtitle: 'Your grades will appear here',
                        )
                      else
                        for (final a in _assignments)
                          _GradeRow(assignment: a),
                    ],
                  ),
                ),
    );
  }
}

// ── Stat Tile ─────────────────────────────────────────────────────────────────

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
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: GoogleFonts.dmSans(fontSize: 20, fontWeight: FontWeight.w800, color: color),
              ),
              Text(
                label,
                style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textLight, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Grade Row ─────────────────────────────────────────────────────────────────

class _GradeRow extends StatelessWidget {
  final Assignment assignment;
  const _GradeRow({required this.assignment});

  double? get _pct => (assignment.grade != null && assignment.totalMarks != null && assignment.totalMarks! > 0)
      ? assignment.grade! / assignment.totalMarks! * 100
      : null;

  Color get _color {
    if (assignment.grade == null) return DiklyColors.textLight;
    final p = _pct;
    if (p == null) return DiklyColors.primary;
    if (p >= 70) return DiklyColors.success;
    if (p >= 50) return DiklyColors.warning;
    return DiklyColors.error;
  }

  String get _label {
    if (!assignment.isSubmitted) return 'Not Submitted';
    if (assignment.grade == null) return 'Pending';
    if (assignment.totalMarks != null) return '${assignment.grade}/${assignment.totalMarks}';
    return '${assignment.grade}';
  }

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: _color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              assignment.grade != null ? Icons.grade_rounded : Icons.assignment_outlined,
              color: _color,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  assignment.title,
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
                  overflow: TextOverflow.ellipsis,
                ),
                if (assignment.courseName != null)
                  Text(
                    assignment.courseName!,
                    style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight),
                  ),
                if (assignment.feedback != null && assignment.feedback!.isNotEmpty)
                  Text(
                    assignment.feedback!,
                    style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textLight),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(_label, style: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w700, color: _color)),
              if (_pct != null) ...[
                const SizedBox(height: 2),
                Text('${_pct!.toStringAsFixed(0)}%', style: GoogleFonts.dmSans(fontSize: 11, color: _color)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
