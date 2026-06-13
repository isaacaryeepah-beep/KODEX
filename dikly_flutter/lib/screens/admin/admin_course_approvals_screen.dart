import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _adminCourseApprovalsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getAdminCourseApprovals(),
);

class AdminCourseApprovalsScreen extends ConsumerStatefulWidget {
  const AdminCourseApprovalsScreen({super.key});

  @override
  ConsumerState<AdminCourseApprovalsScreen> createState() => _AdminCourseApprovalsScreenState();
}

class _AdminCourseApprovalsScreenState extends ConsumerState<AdminCourseApprovalsScreen> {
  final Set<String> _processing = {};

  Future<void> _approve(String id) async {
    if (_processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.approveCourse(id);
      ref.invalidate(_adminCourseApprovalsProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Course approved'), backgroundColor: DiklyColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
      );
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  Future<void> _reject(String id) async {
    if (_processing.contains(id)) return;
    setState(() => _processing.add(id));
    try {
      await apiService.rejectCourse(id);
      ref.invalidate(_adminCourseApprovalsProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Course rejected')),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: DiklyColors.error),
      );
    } finally {
      if (mounted) setState(() => _processing.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(_adminCourseApprovalsProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: const BackButton(),
        title: const Text('Course Approvals', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(_adminCourseApprovalsProvider)),
        data: (courses) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(_adminCourseApprovalsProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Course Approvals',
                subtitle: '${courses.length} courses awaiting your review · All departments',
              ),
              if (courses.isEmpty)
                DiklyCard(
                  padding: const EdgeInsets.all(32),
                  child: const Center(
                    child: Text(
                      'No courses pending approval. All caught up!',
                      style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                      textAlign: TextAlign.center,
                    ),
                  ),
                )
              else
                ...courses.map((c) {
                  final id = c['_id']?.toString() ?? c['id']?.toString() ?? '';
                  final title = c['title']?.toString() ?? c['name']?.toString() ?? 'Untitled';
                  final code = c['code']?.toString() ?? '';
                  final dept = c['department']?.toString() ?? '';
                  final lecturer = (c['lecturer'] is Map ? c['lecturer']['name'] : null)?.toString() ?? '';
                  final isProcessing = _processing.contains(id);

                  return DiklyCard(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (code.isNotEmpty) Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFF2563EB).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(code, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF2563EB))),
                            ),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF59E0B).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: const Text('PENDING', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFF59E0B))),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                        if (lecturer.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Row(children: [
                            const Icon(Icons.person_outline, size: 13, color: Color(0xFF6B7280)),
                            const SizedBox(width: 4),
                            Text(lecturer, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                          ]),
                        ],
                        if (dept.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Row(children: [
                            const Icon(Icons.school_outlined, size: 13, color: Color(0xFF6B7280)),
                            const SizedBox(width: 4),
                            Text(dept, style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280))),
                          ]),
                        ],
                        const SizedBox(height: 12),
                        if (isProcessing)
                          const Center(child: CircularProgressIndicator())
                        else
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: () => _approve(id),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: DiklyColors.success,
                                    foregroundColor: Colors.white,
                                    elevation: 0,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  ),
                                  child: const Text('Approve', style: TextStyle(fontSize: 13)),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => _reject(id),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: DiklyColors.error,
                                    side: const BorderSide(color: Color(0xFFE5E7EB)),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  ),
                                  child: const Text('Reject', style: TextStyle(fontSize: 13)),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }
}
