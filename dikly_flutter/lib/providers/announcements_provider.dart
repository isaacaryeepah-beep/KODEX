import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api.dart';
import '../models/announcement.dart';

final announcementsProvider = FutureProvider<List<Announcement>>((ref) async {
  return apiService.getAnnouncements();
});
