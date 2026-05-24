import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../models/course_video.dart';

class CourseDetailScreen extends StatefulWidget {
  final String courseId;

  const CourseDetailScreen({super.key, required this.courseId});

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  Course? _course;
  List<CourseVideo> _videos = [];
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
      final course = await apiService.getCourseById(widget.courseId);
      List<CourseVideo> videos = [];
      try {
        videos = await apiService.getCourseVideos(widget.courseId);
      } catch (_) {}
      setState(() { _course = course; _videos = videos; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    Text(_error!),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                    TextButton(onPressed: () => context.pop(), child: const Text('Go Back')),
                  ],
                ))
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final course = _course!;
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 200,
          pinned: true,
          leading: BackButton(onPressed: () => context.pop()),
          actions: [
            IconButton(
              icon: const Icon(Icons.video_library_outlined),
              onPressed: () => context.push('/course-videos/${course.id}'),
            ),
          ],
          flexibleSpace: FlexibleSpaceBar(
            title: Text(course.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            background: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [DiklyColors.primary, DiklyColors.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: const Center(
                child: Icon(Icons.school_rounded, size: 64, color: Colors.white24),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Info
                _InfoSection(course: course),
                const SizedBox(height: 16),
                // Description
                if (course.description != null && course.description!.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: DiklyColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: DiklyColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('About this Course', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 8),
                        Text(course.description!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary, height: 1.6)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                // Quick Actions
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/course-videos/${course.id}'),
                        icon: const Icon(Icons.play_circle_outline_rounded),
                        label: Text('Videos (${_videos.length})'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.go('/assignments'),
                        icon: const Icon(Icons.assignment_outlined),
                        label: const Text('Assignments'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Videos preview
                if (_videos.isNotEmpty) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Course Videos', style: Theme.of(context).textTheme.titleLarge),
                      TextButton(
                        onPressed: () => context.push('/course-videos/${course.id}'),
                        child: const Text('See all'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final video in _videos.take(3))
                    _VideoTile(
                      video: video,
                      onTap: () => context.push('/video-player', extra: {'url': video.embedUrl, 'title': video.title}),
                    ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoSection extends StatelessWidget {
  final Course course;
  const _InfoSection({required this.course});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        children: [
          _Row(icon: Icons.tag_rounded, label: 'Course Code', value: course.code ?? 'N/A'),
          const Divider(height: 20),
          _Row(icon: Icons.person_outline_rounded, label: 'Instructor', value: course.instructorName ?? 'N/A'),
          const Divider(height: 20),
          _Row(icon: Icons.people_outline_rounded, label: 'Students', value: '${course.studentCount ?? 0}'),
          const Divider(height: 20),
          _Row(icon: Icons.circle_outlined, label: 'Status', value: (course.status ?? 'active').toUpperCase()),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _Row({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: DiklyColors.primary),
        const SizedBox(width: 10),
        Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
        const Spacer(),
        Text(value, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _VideoTile extends StatelessWidget {
  final CourseVideo video;
  final VoidCallback onTap;
  const _VideoTile({required this.video, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: DiklyColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: DiklyColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.play_arrow_rounded, color: DiklyColors.primary, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(video.title, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis),
                  Text(video.videoType.toUpperCase(), style: Theme.of(context).textTheme.labelSmall?.copyWith(color: DiklyColors.primary)),
                ],
              ),
            ),
            const Icon(Icons.play_circle_outline_rounded, color: DiklyColors.primary),
          ],
        ),
      ),
    );
  }
}
