import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course_video.dart';
import '../../widgets/ds/dikly_ds.dart';

final _studentVideosProvider = FutureProvider.autoDispose<List<CourseVideo>>(
  (ref) async {
    // Fetch all course videos across enrolled courses
    final response = await apiService.getMyCourseVideos();
    // getMyCourseVideos returns courses with videos embedded, flatten them
    final allVideos = <CourseVideo>[];
    for (final course in response) {
      final videos = course['videos'] as List? ?? [];
      for (final v in videos) {
        try {
          allVideos.add(CourseVideo.fromJson(v as Map<String, dynamic>));
        } catch (_) {}
      }
    }
    return allVideos;
  },
);

class StudentCourseVideosScreen extends ConsumerWidget {
  const StudentCourseVideosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_studentVideosProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Course Videos'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load videos'),
              TextButton(
                onPressed: () => ref.refresh(_studentVideosProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (videos) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_studentVideosProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DiklyScreenHeader(
                title: 'Course Videos',
                subtitle: 'Watch video resources shared by your lecturers',
              ),
              if (videos.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: DiklyColors.border),
                  ),
                  child: const Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.play_circle_outline, size: 56, color: Color(0xFFD1D5DB)),
                      SizedBox(height: 16),
                      Text(
                        'No videos yet',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: 8),
                      Text(
                        "Your lecturers haven't added any videos for your courses.",
                        style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                )
              else
                DiklyCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: videos.map((v) => _VideoTile(video: v)).toList(),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VideoTile extends StatelessWidget {
  final CourseVideo video;
  const _VideoTile({required this.video});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final url = video.embedUrl;
        if (url.isNotEmpty) {
          final uri = Uri.parse(url);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: DiklyColors.border, width: 0.5)),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: const Color(0xFFFEE2E2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.play_circle_outline, color: Color(0xFFEF4444), size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    video.title,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (video.platform != null)
                    Text(video.platform!, style: const TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                ],
              ),
            ),
            const Icon(Icons.open_in_new, size: 14, color: DiklyColors.textLight),
          ],
        ),
      ),
    );
  }
}
