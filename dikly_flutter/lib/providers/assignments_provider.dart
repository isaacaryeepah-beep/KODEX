import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api.dart';
import '../models/assignment.dart';

final assignmentsProvider = FutureProvider<List<Assignment>>((ref) async {
  return apiService.getAssignments();
});
