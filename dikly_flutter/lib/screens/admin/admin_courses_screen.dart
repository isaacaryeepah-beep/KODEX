import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/ds/dikly_ds.dart';


class AdminCoursesScreen extends ConsumerStatefulWidget {
  const AdminCoursesScreen({super.key});

  @override
  ConsumerState<AdminCoursesScreen> createState() => _AdminCoursesScreenState();
}

class _AdminCoursesScreenState extends ConsumerState<AdminCoursesScreen> {
  void _showCreateDialog() {
    final titleCtrl = TextEditingController();
    final codeCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Create Course', style: TextStyle(fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Course Title')),
          const SizedBox(height: 10),
          TextField(controller: codeCtrl, decoration: const InputDecoration(labelText: 'Course Code')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
            onPressed: () async {
              Navigator.pop(context);
              try {
                await apiService.createCourse({'title': titleCtrl.text.trim(), 'code': codeCtrl.text.trim()});
                ref.invalidate(coursesProvider);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Course created!')));
              } catch (e) {
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateDialog,
        backgroundColor: const Color(0xFFDC2626),
        icon: const Icon(Icons.add),
        label: const Text('New Course'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(coursesProvider),
        child: coursesAsync.when(
          data: (courses) => courses.isEmpty
              ? const DiklyEmptyState(icon: Icons.book_outlined, title: 'No Courses', subtitle: 'Create the first course.')
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                  itemCount: courses.length,
                  itemBuilder: (_, i) {
                    final c = courses[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        leading: Container(
                          width: 44, height: 44,
                          decoration: BoxDecoration(color: const Color(0xFFDC2626).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                          child: const Icon(Icons.book_outlined, color: Color(0xFFDC2626)),
                        ),
                        title: Text(c.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        subtitle: Text('${c.code ?? 'No code'} · ${c.studentCount ?? 0} students', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                        trailing: Text(c.status ?? 'active', style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
                      ),
                    );
                  },
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => DiklyErrorView(message: e.toString(), onRetry: () => ref.invalidate(coursesProvider)),
        ),
      ),
    );
  }
}
