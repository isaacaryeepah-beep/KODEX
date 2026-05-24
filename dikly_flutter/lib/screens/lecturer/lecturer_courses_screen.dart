import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../models/course_video.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';

class LecturerCoursesScreen extends ConsumerStatefulWidget {
  const LecturerCoursesScreen({super.key});

  @override
  ConsumerState<LecturerCoursesScreen> createState() => _LecturerCoursesScreenState();
}

class _LecturerCoursesScreenState extends ConsumerState<LecturerCoursesScreen> {
  String? _selectedCourseId;
  List<CourseVideo> _videos = [];
  bool _loadingVideos = false;

  Future<void> _selectCourse(String courseId) async {
    setState(() { _selectedCourseId = courseId; _loadingVideos = true; _videos = []; });
    try {
      final videos = await apiService.getCourseVideos(courseId);
      setState(() { _videos = videos; _loadingVideos = false; });
    } catch (_) {
      setState(() => _loadingVideos = false);
    }
  }

  void _showAddVideoDialog() {
    final titleCtrl = TextEditingController();
    final urlCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Add Course Video', style: TextStyle(fontWeight: FontWeight.w700)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Video Title')),
          const SizedBox(height: 12),
          TextField(controller: urlCtrl, decoration: const InputDecoration(labelText: 'YouTube / Vimeo URL'), keyboardType: TextInputType.url),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
            onPressed: () async {
              Navigator.pop(context);
              if (_selectedCourseId == null) return;
              try {
                await apiService.addCourseVideo({'courseId': _selectedCourseId, 'title': titleCtrl.text.trim(), 'url': urlCtrl.text.trim()});
                await _selectCourse(_selectedCourseId!);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Video added!')));
              } catch (e) {
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: DiklyColors.error));
              }
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      floatingActionButton: _selectedCourseId != null
          ? FloatingActionButton.extended(
              onPressed: _showAddVideoDialog,
              backgroundColor: const Color(0xFF7C3AED),
              icon: const Icon(Icons.add),
              label: const Text('Add Video'),
            )
          : null,
      body: coursesAsync.when(
        data: (courses) => courses.isEmpty
            ? const EmptyState(icon: Icons.book_outlined, title: 'No Courses', message: 'No courses assigned to you yet.')
            : Row(children: [
                SizedBox(
                  width: 160,
                  child: ListView.builder(
                    itemCount: courses.length,
                    itemBuilder: (_, i) {
                      final c = courses[i];
                      final selected = _selectedCourseId == c.id;
                      return InkWell(
                        onTap: () => _selectCourse(c.id),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: selected ? const Color(0xFF7C3AED).withOpacity(0.1) : null,
                            border: const Border(right: BorderSide(color: DiklyColors.border)),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(c.title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? const Color(0xFF7C3AED) : DiklyColors.textPrimary), maxLines: 2, overflow: TextOverflow.ellipsis),
                            if (c.code != null) Text(c.code!, style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
                Expanded(child: _selectedCourseId == null
                    ? const Center(child: Text('Select a course to view videos', style: TextStyle(color: DiklyColors.textSecondary, fontSize: 13)))
                    : _loadingVideos
                        ? const Center(child: CircularProgressIndicator())
                        : _videos.isEmpty
                            ? const EmptyState(icon: Icons.video_library_outlined, title: 'No Videos', message: 'Add videos to this course.')
                            : ListView.builder(
                                padding: const EdgeInsets.fromLTRB(12, 12, 12, 80),
                                itemCount: _videos.length,
                                itemBuilder: (_, i) => _VideoCard(video: _videos[i], onDelete: () async {
                                  await apiService.deleteCourseVideo(_videos[i].id);
                                  await _selectCourse(_selectedCourseId!);
                                }),
                              )),
              ]),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(coursesProvider)),
      ),
    );
  }
}

class _VideoCard extends StatelessWidget {
  final CourseVideo video;
  final VoidCallback onDelete;
  const _VideoCard({required this.video, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: const Color(0xFFEF4444).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
          child: const Icon(Icons.play_circle_outline, color: Color(0xFFEF4444), size: 22),
        ),
        title: Text(video.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(video.platform ?? 'Video', style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
        trailing: IconButton(
          icon: const Icon(Icons.delete_outline, size: 18, color: DiklyColors.error),
          onPressed: onDelete,
        ),
      ),
    );
  }
}
