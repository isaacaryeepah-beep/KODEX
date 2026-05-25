import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../models/course_video.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_view.dart';

class StudentCoursesScreen extends ConsumerWidget {
  const StudentCoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(coursesProvider),
      child: coursesAsync.when(
        data: (courses) => courses.isEmpty
            ? const EmptyState(icon: Icons.book_outlined, title: 'No Courses', message: 'You are not enrolled in any courses yet.')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: courses.length,
                itemBuilder: (_, i) => _CourseCard(course: courses[i]),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(coursesProvider)),
      ),
    );
  }
}

class _CourseCard extends ConsumerStatefulWidget {
  final Course course;
  const _CourseCard({required this.course});

  @override
  ConsumerState<_CourseCard> createState() => _CourseCardState();
}

class _CourseCardState extends ConsumerState<_CourseCard> {
  bool _expanded = false;
  List<CourseVideo>? _videos;
  bool _loadingVideos = false;

  Future<void> _loadVideos() async {
    if (_videos != null) { setState(() => _expanded = !_expanded); return; }
    setState(() { _loadingVideos = true; _expanded = true; });
    try {
      final videos = await apiService.getCourseVideos(widget.course.id);
      setState(() { _videos = videos; _loadingVideos = false; });
    } catch (_) {
      setState(() { _loadingVideos = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        children: [
          ListTile(
            leading: Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.book_outlined, color: DiklyColors.primary),
            ),
            title: Text(widget.course.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            subtitle: Text(widget.course.code ?? widget.course.instructorName ?? '',
                style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary)),
            trailing: IconButton(
              icon: Icon(_expanded ? Icons.expand_less : Icons.video_library_outlined, size: 20),
              onPressed: _loadVideos,
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1),
            if (_loadingVideos)
              const Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())
            else if (_videos == null || _videos!.isEmpty)
              const Padding(padding: EdgeInsets.all(16), child: Text('No videos yet', style: TextStyle(color: DiklyColors.textSecondary, fontSize: 13)))
            else
              ..._videos!.map((v) => _VideoTile(video: v)),
          ],
        ],
      ),
    );
  }
}

class _VideoTile extends StatelessWidget {
  final CourseVideo video;
  const _VideoTile({required this.video});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(color: const Color(0xFFEF4444).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: const Icon(Icons.play_circle_outline, color: Color(0xFFEF4444), size: 20),
      ),
      title: Text(video.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(video.platform ?? 'Video', style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
      onTap: () async {
        final url = video.embedUrl ?? video.url;
        if (url != null && await canLaunchUrl(Uri.parse(url))) {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        }
      },
    );
  }
}
