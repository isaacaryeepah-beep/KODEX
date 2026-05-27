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
                subtitle: '${courses.length} enrolled course${courses.length == 1 ? '' : 's'}',
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

  @override
  Widget build(BuildContext context) {
    final course = widget.course;
    final isActive = course.status?.toLowerCase() == 'active' || course.status == null;

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
                // Course code chip + status badge row
                Row(
                  children: [
                    if (course.code != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: DiklyColors.primaryULight,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          course.code!,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: DiklyColors.primary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    const Spacer(),
                    DiklyBadge(
                      label: isActive ? 'Active' : (course.status ?? 'Active'),
                      color: isActive ? DiklyColors.success : DiklyColors.textLight,
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Title
                Text(
                  course.title.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.text,
                    letterSpacing: 0.2,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),

                // Instructor row
                if (course.instructorName != null)
                  Row(
                    children: [
                      const Icon(Icons.person_outline, size: 15, color: DiklyColors.textLight),
                      const SizedBox(width: 5),
                      Text(
                        course.instructorName!,
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                    ],
                  ),

                // Enrolled count
                if (course.studentCount != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.people_outline, size: 15, color: DiklyColors.textLight),
                      const SizedBox(width: 5),
                      Text(
                        '${course.studentCount} enrolled',
                        style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          // Expand button
          InkWell(
            onTap: _loadVideos,
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(10)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(
                color: Color(0xFFF9FAFB),
                border: Border(top: BorderSide(color: DiklyColors.border, width: 1)),
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(10)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.play_circle_outline, size: 16, color: DiklyColors.primary),
                  const SizedBox(width: 6),
                  const Text(
                    'Course Videos',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: DiklyColors.primary,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 18,
                    color: DiklyColors.textLight,
                  ),
                ],
              ),
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
