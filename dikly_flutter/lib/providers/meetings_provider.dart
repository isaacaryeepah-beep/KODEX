import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api.dart';
import '../models/meeting.dart';

final meetingsProvider = FutureProvider<List<Meeting>>((ref) async {
  return apiService.getMeetings();
});

final upcomingMeetingsProvider = FutureProvider<List<Meeting>>((ref) async {
  return apiService.getUpcomingMeetings();
});

final liveMeetingsProvider = FutureProvider<List<Meeting>>((ref) async {
  return apiService.getLiveMeetings();
});
