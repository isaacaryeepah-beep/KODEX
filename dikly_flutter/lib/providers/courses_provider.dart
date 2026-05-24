import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api.dart';
import '../models/course.dart';

final coursesProvider = FutureProvider<List<Course>>((ref) async {
  return apiService.getCourses();
});

final courseVideosProvider = FutureProvider.family<List<dynamic>, String>((ref, courseId) async {
  return apiService.getCourseVideos(courseId);
});
