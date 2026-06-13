import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/course.dart';
import '../../models/course_video.dart';
import '../../providers/courses_provider.dart';
import '../../widgets/ds/dikly_ds.dart';


class StudentCoursesScreen extends ConsumerStatefulWidget {
  const StudentCoursesScreen({super.key});

  @override
  ConsumerState<StudentCoursesScreen> createState() => _StudentCoursesScreenState();
}

class _StudentCoursesScreenState extends ConsumerState<StudentCoursesScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(coursesProvider),
      child: coursesAsync.when(
        data: (courses) {
          final filtered = _query.isEmpty
              ? courses
              : courses.where((c) =>
                  c.title.toLowerCase().contains(_query.toLowerCase()) ||
                  (c.code?.toLowerCase().contains(_query.toLowerCase()) ?? false) ||
                  (c.instructorName?.toLowerCase().contains(_query.toLowerCase()) ?? false))
              .toList();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // ── Header ──────────────────────────────────────────────
              DiklyScreenHeader(
                title: 'My Courses',
                subtitle: 'Your enrolled academic courses',
              ),

              // ── Search bar ──────────────────────────────────────────
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: DiklyColors.border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0A000000),
                      blurRadius: 4,
                      offset: Offset(0, 1),
                    ),
                  ],
                ),
                child: TextField(
                  controller: _searchController,
                  onChanged: (v) => setState(() => _query = v),
                  style: const TextStyle(fontSize: 14, color: DiklyColors.text),
                  decoration: const InputDecoration(
                    hintText: 'Search courses...',
                    hintStyle: TextStyle(color: DiklyColors.textMuted, fontSize: 14),
                    prefixIcon: Icon(Icons.search, color: DiklyColors.textLight, size: 20),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ── Course list ─────────────────────────────────────────
              if (filtered.isEmpty)
                DiklyEmptyState(
                  icon: Icons.book_outlined,
                  title: courses.isEmpty ? 'No Courses Yet' : 'No Results',
                  subtitle: courses.isEmpty
                      ? 'You are not enrolled in any courses yet.'
                      : 'No courses match your search.',
                )
              else
                ...filtered.map((c) => _CourseCard(course: c)),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => DiklyErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(coursesProvider),
        ),
      ),
    );
  }
}

// ── Course Card ─────────────────────────────────────────────────────────────

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
    if (_videos != null) {
      setState(() => _expanded = !_expanded);
      return;
    }
    setState(() {
      _loadingVideos = true;
      _expanded = true;
    });
    try {
      final videos = await apiService.getCourseVideos(widget.course.id);
      setState(() {
        _videos = videos;
        _loadingVideos = false;
      });
    } catch (_) {
      setState(() => _loadingVideos = false);
    }
  }

  static Widget _tag(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(5)),
    child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
  );

  @override
  Widget build(BuildContext context) {
    final course = widget.course;
    final isApproved = (course.status ?? 'active').toLowerCase() == 'approved' ||
        (course.status ?? 'active').toLowerCase() == 'active';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: EdgeInsets.zero,
      borderRadius: 10,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Code, level, group, status row
                Row(
                  children: [
                    if (course.code != null) _tag(course.code!, const Color(0xFF7C3AED)),
                    if (course.level != null) ...[const SizedBox(width: 6), _tag('Level ${course.level!}', const Color(0xFF6B7280))],
                    if (course.group != null) ...[const SizedBox(width: 6), _tag('Group ${course.group!}', const Color(0xFF6B7280))],
                    const Spacer(),
                    isApproved ? DiklyBadge.approved() : DiklyBadge.pending(),
                  ],
                ),
                const SizedBox(height: 10),

                // Title
                Text(
                  course.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.text,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),

                // Instructor row
                if (course.instructorName != null)
                  Row(
                    children: [
                      const Icon(Icons.person_outline, size: 14, color: Color(0xFF6B7280)),
                      const SizedBox(width: 4),
                      Text(
                        course.instructorName!,
                        style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),

                // Enrolled count
                if (course.studentCount != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.people_outline, size: 14, color: Color(0xFF6B7280)),
                      const SizedBox(width: 4),
                      Text(
                        '${course.studentCount} students enrolled',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          // Bottom row: Videos + Certificate
          Container(
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: DiklyColors.border, width: 1)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: _loadVideos,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      color: const Color(0xFFF9FAFB),
                      child: Row(
                        children: [
                          const Icon(Icons.play_circle_outline, size: 15, color: DiklyColors.primary),
                          const SizedBox(width: 5),
                          const Text('Course Videos', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: DiklyColors.primary)),
                          const Spacer(),
                          Icon(_expanded ? Icons.expand_less : Icons.expand_more, size: 16, color: DiklyColors.textLight),
                        ],
                      ),
                    ),
                  ),
                ),
                Container(width: 1, height: 38, color: DiklyColors.border),
                InkWell(
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Certificate — coming soon')),
                  ),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    color: const Color(0xFFF9FAFB),
                    child: const Row(
                      children: [
                        Text('🎓', style: TextStyle(fontSize: 14)),
                        SizedBox(width: 4),
                        Text('Certificate', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF6B7280))),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Videos expanded section
          if (_expanded) ...[
            if (_loadingVideos)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_videos == null || _videos!.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'No videos available yet.',
                  style: TextStyle(fontSize: 13, color: DiklyColors.textLight),
                ),
              )
            else
              ..._videos!.map((v) => _VideoTile(video: v)),
          ],
        ],
      ),
    );
  }
}

// ── Video Tile ──────────────────────────────────────────────────────────────

class _VideoTile extends StatelessWidget {
  final CourseVideo video;
  const _VideoTile({required this.video});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final url = video.embedUrl;
        if (await canLaunchUrl(Uri.parse(url))) {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: DiklyColors.border, width: 1)),
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
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
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: DiklyColors.text,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (video.platform != null)
                    Text(
                      video.platform!,
                      style: const TextStyle(fontSize: 11, color: DiklyColors.textLight),
                    ),
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
