import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../models/course_video.dart';
import '../../widgets/ds/dikly_ds.dart';

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
                    const Text(
                      'Something went wrong. Please try again.',
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      textAlign: TextAlign.center,
                    ),
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
        // AppBar with blue gradient banner
        SliverAppBar(
          expandedHeight: 200,
          pinned: true,
          leading: BackButton(
            onPressed: () => context.pop(),
            color: Colors.white,
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.video_library_outlined, color: Colors.white),
              onPressed: () => context.push('/course-videos/${course.id}'),
            ),
          ],
          backgroundColor: DiklyColors.primary,
          surfaceTintColor: Colors.transparent,
          flexibleSpace: FlexibleSpaceBar(
            collapseMode: CollapseMode.parallax,
            background: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [DiklyColors.primary, DiklyColors.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 56, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      // Course code
                      if (course.code != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            course.code!.toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                      Text(
                        course.title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          height: 1.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
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
                // Instructor info card
                DiklyCard(
                  margin: EdgeInsets.zero,
                  child: Column(
                    children: [
                      _InfoRow(icon: Icons.tag_rounded, label: 'Course Code', value: course.code ?? 'N/A'),
                      Divider(height: 20, color: DiklyColors.border),
                      _InfoRow(
                        icon: Icons.person_outline_rounded,
                        label: 'Instructor',
                        value: course.instructorName ?? 'N/A',
                      ),
                      Divider(height: 20, color: DiklyColors.border),
                      _InfoRow(
                        icon: Icons.people_outline_rounded,
                        label: 'Enrolled',
                        value: '${course.studentCount ?? 0} students',
                      ),
                      Divider(height: 20, color: DiklyColors.border),
                      _InfoRow(
                        icon: Icons.circle_outlined,
                        label: 'Status',
                        value: (course.status ?? 'active')[0].toUpperCase() +
                            (course.status ?? 'active').substring(1),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Description
                if (course.description != null && course.description!.isNotEmpty) ...[
                  DiklyCard(
                    margin: EdgeInsets.zero,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'About this Course',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          course.description!,
                          style: const TextStyle(
                            fontSize: 14,
                            color: DiklyColors.textSecondary,
                            height: 1.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Quick Actions: Videos + Assignments buttons
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/course-videos/${course.id}'),
                        icon: const Icon(Icons.play_circle_outline_rounded, size: 18),
                        label: Text('Videos (${_videos.length})'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.primary,
                          side: const BorderSide(color: DiklyColors.border),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.go('/assignments'),
                        icon: const Icon(Icons.assignment_outlined, size: 18),
                        label: const Text('Assignments'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: DiklyColors.primary,
                          side: const BorderSide(color: DiklyColors.border),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
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
                      const Text(
                        'Course Videos',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: DiklyColors.text),
                      ),
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
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: DiklyColors.primary),
        const SizedBox(width: 10),
        Text(
          label,
          style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
        ),
        const Spacer(),
        Text(
          value,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text),
        ),
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
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: DiklyColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.play_arrow_rounded, color: DiklyColors.primary, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  video.title,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  video.videoType.toUpperCase(),
                  style: const TextStyle(fontSize: 11, color: DiklyColors.primary, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const Icon(Icons.play_circle_outline_rounded, color: DiklyColors.primary, size: 22),
        ],
      ),
    );
  }
}
