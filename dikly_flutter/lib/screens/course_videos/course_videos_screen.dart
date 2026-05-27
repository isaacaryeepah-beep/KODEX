import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/course_video.dart';
import '../../widgets/app_shell.dart';

import '../../widgets/ds/empty_state.dart';

class CourseVideosScreen extends ConsumerStatefulWidget {
  final String courseId;

  const CourseVideosScreen({super.key, required this.courseId});

  @override
  ConsumerState<CourseVideosScreen> createState() => _CourseVideosScreenState();
}

class _CourseVideosScreenState extends ConsumerState<CourseVideosScreen> {
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
      final videos = await apiService.getCourseVideos(widget.courseId);
      setState(() { _videos = videos; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _addVideo() async {
    final titleCtrl = TextEditingController();
    final urlCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Video'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Video Title')),
              const SizedBox(height: 12),
              TextField(controller: urlCtrl, decoration: const InputDecoration(labelText: 'Video URL (YouTube, Vimeo, etc.)')),
              const SizedBox(height: 12),
              TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description (optional)'), maxLines: 2),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
      ),
    );

    if (result != true) return;
    try {
      await apiService.addCourseVideo({
        'courseId': widget.courseId,
        'title': titleCtrl.text.trim(),
        'url': urlCtrl.text.trim(),
        'description': descCtrl.text.trim(),
      });
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Video added!'), backgroundColor: DiklyColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  Future<void> _deleteVideo(CourseVideo video) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Video'),
        content: Text('Delete "${video.title}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: DiklyColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await apiService.deleteCourseVideo(video.id);
      await _loadData();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canManage = user?.role == 'lecturer' || user?.role == 'admin';

    return AppShell(
      title: 'Course Videos',
      floatingActionButton: canManage
          ? FloatingActionButton(onPressed: _addVideo, child: const Icon(Icons.add))
          : null,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    Text(_error!),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                  ],
                ))
              : _videos.isEmpty
                  ? DiklyEmptyState(
                      icon: Icons.video_library_outlined,
                      title: 'No videos yet',
                      subtitle: canManage ? 'Add videos for this course' : 'No videos available for this course',
                      buttonLabel: canManage ? 'Add Video' : null,
                      onButton: canManage ? _addVideo : null,
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _videos.length,
                        itemBuilder: (context, index) {
                          final video = _videos[index];
                          return _VideoCard(
                            video: video,
                            canDelete: canManage,
                            onTap: () => context.push('/video-player', extra: {
                              'url': video.embedUrl,
                              'title': video.title,
                            }),
                            onDelete: () => _deleteVideo(video),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _VideoCard extends StatelessWidget {
  final CourseVideo video;
  final bool canDelete;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _VideoCard({
    required this.video,
    required this.canDelete,
    required this.onTap,
    required this.onDelete,
  });

  Color get _typeColor {
    switch (video.videoType) {
      case 'youtube': return const Color(0xFFDC2626);
      case 'vimeo': return const Color(0xFF1AB7EA);
      case 'drive': return const Color(0xFF4285F4);
      case 'loom': return const Color(0xFF625DF5);
      default: return DiklyColors.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: DiklyColors.border),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          children: [
            // Thumbnail placeholder
            Container(
              height: 120,
              decoration: BoxDecoration(
                color: _typeColor.withOpacity(0.1),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Icon(Icons.play_circle_filled_rounded, size: 48, color: _typeColor),
                  Positioned(
                    top: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: _typeColor,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        video.videoType.toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          video.title,
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (video.description != null && video.description!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            video.description!,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (canDelete)
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, color: DiklyColors.error, size: 20),
                      onPressed: onDelete,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
