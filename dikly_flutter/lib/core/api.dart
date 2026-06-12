import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../models/meeting.dart';
import '../models/course.dart';
import '../models/course_video.dart';
import '../models/assignment.dart';
import '../models/attendance.dart';
import '../models/quiz.dart';
import '../models/message.dart';
import '../models/announcement.dart';
import 'cache.dart';

const String _baseUrl = 'https://dikly.sbs';
const FlutterSecureStorage _storage = FlutterSecureStorage();

class ApiService {
  late final Dio _dio;

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'auth_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) {
        handler.next(error);
      },
    ));
  }

  bool _isOfflineError(Object e) {
    if (e is DioException) {
      return e.type == DioExceptionType.connectionTimeout ||
             e.type == DioExceptionType.receiveTimeout ||
             e.type == DioExceptionType.connectionError ||
             e.message?.toLowerCase().contains('socket') == true;
    }
    return false;
  }

  /// GET with cache-first-when-offline strategy.
  /// Online: fetch network, update cache, return fresh data.
  /// Offline: return cached data or throw if no cache.
  Future<dynamic> _cachedGet(String path, String cacheKey) async {
    try {
      final response = await _dio.get(path);
      await CacheService.set(cacheKey, response.data);
      return response.data;
    } catch (e) {
      if (_isOfflineError(e)) {
        final cached = CacheService.get(cacheKey);
        if (cached != null) return cached;
      }
      rethrow;
    }
  }

  /// POST/PUT/DELETE that queues when offline.
  Future<dynamic> _queueablePost(String path, Map<String, dynamic> body, {String method = 'POST'}) async {
    try {
      final response = method == 'PUT'
          ? await _dio.put(path, data: body)
          : await _dio.post(path, data: body);
      return response.data;
    } catch (e) {
      if (_isOfflineError(e)) {
        await CacheService.enqueueWrite({'method': method, 'path': path, 'body': body});
        return {'queued': true, 'offline': true};
      }
      rethrow;
    }
  }

  /// Flush all queued writes when back online.
  Future<void> flushWriteQueue() async {
    final queue = CacheService.getPendingWrites();
    if (queue.isEmpty) return;
    final failed = <Map<String, dynamic>>[];
    for (final op in queue) {
      try {
        final method = op['method'] as String? ?? 'POST';
        final path   = op['path'] as String;
        final body   = (op['body'] as Map?)?.cast<String, dynamic>() ?? {};
        if (method == 'PUT') {
          await _dio.put(path, data: body);
        } else {
          await _dio.post(path, data: body);
        }
      } catch (_) {
        failed.add(op);
      }
    }
    await CacheService.clearPendingWrites();
    for (final f in failed) {
      await CacheService.enqueueWrite(f);
    }
  }

  // Auth
  Future<Map<String, dynamic>> login({
    required String password,
    required String loginRole,
    required String portalMode,
    required String deviceId,
    String? email,
    String? indexNumber,
    String? institutionCode,
  }) async {
    final body = <String, dynamic>{
      'password': password,
      'loginRole': loginRole,
      'portalMode': portalMode,
      'deviceId': deviceId,
    };
    if (email != null && email.isNotEmpty) body['email'] = email;
    if (indexNumber != null && indexNumber.isNotEmpty) body['indexNumber'] = indexNumber;
    if (institutionCode != null && institutionCode.isNotEmpty) body['institutionCode'] = institutionCode;
    final response = await _dio.post('/api/auth/login', data: body);
    return response.data as Map<String, dynamic>;
  }

  Future<User> getMe() async {
    final data = await _cachedGet('/api/auth/me', 'me');
    final userData = data['user'] ?? data['data'] ?? data;
    return User.fromJson(userData as Map<String, dynamic>);
  }

  Future<void> logout() async {
    try {
      await _dio.post('/api/auth/logout');
    } catch (_) {}
    await _storage.delete(key: 'auth_token');
  }

  // Meetings
  Future<List<Meeting>> getMeetings() async {
    final data = await _cachedGet('/api/meetings', 'meetings');
    final list = data['data'] ?? data['meetings'] ?? [];
    return (list as List).map((e) => Meeting.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Meeting>> getUpcomingMeetings() async {
    final data = await _cachedGet('/api/meetings/upcoming', 'meetings:upcoming');
    final list = data['data'] ?? data['meetings'] ?? [];
    return (list as List).map((e) => Meeting.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Meeting>> getLiveMeetings() async {
    final data = await _cachedGet('/api/meetings/live', 'meetings:live');
    final list = data['data'] ?? data['meetings'] ?? [];
    return (list as List).map((e) => Meeting.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Meeting> getMeetingById(String id) async {
    final response = await _dio.get('/api/meetings/$id');
    final data = response.data;
    return Meeting.fromJson(data['data'] ?? data as Map<String, dynamic>);
  }

  Future<Meeting> createMeeting(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/meetings/create', data: body);
    final data = response.data;
    return Meeting.fromJson(data['data'] ?? data as Map<String, dynamic>);
  }

  Future<void> startMeeting(String id) async {
    await _dio.post('/api/meetings/$id/start');
  }

  Future<void> endMeeting(String id) async {
    await _dio.post('/api/meetings/$id/end');
  }

  Future<Map<String, dynamic>> joinMeeting(String id) async {
    final response = await _dio.get('/api/meetings/$id/join');
    final data = response.data;
    return data['data'] ?? data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getMeetingAttendance(String id) async {
    final response = await _dio.get('/api/meetings/$id/attendance');
    final data = response.data;
    return data['data'] ?? data['attendance'] ?? [];
  }

  // Courses
  Future<List<Course>> getCourses() async {
    final data = await _cachedGet('/api/courses', 'courses');
    final list = data['courses'] ?? data['data'] ?? [];
    return (list as List).map((e) => Course.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Course> getCourseById(String id) async {
    final response = await _dio.get('/api/courses/$id');
    final data = response.data;
    return Course.fromJson(data['course'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  Future<Course> createCourse(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/courses', data: body);
    final data = response.data;
    return Course.fromJson(data['course'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  // Course Videos
  Future<List<CourseVideo>> getCourseVideos(String courseId) async {
    final response = await _dio.get('/api/course-videos/$courseId');
    final data = response.data;
    final list = data['videos'] ?? data['data'] ?? [];
    return (list as List).map((e) => CourseVideo.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Map<String, dynamic>>> getMyCourseVideos() async {
    final response = await _dio.get('/api/course-videos/my-courses');
    final data = response.data;
    final list = data['courses'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<CourseVideo> addCourseVideo(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/course-videos', data: body);
    final data = response.data;
    return CourseVideo.fromJson(data['video'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  Future<void> deleteCourseVideo(String id) async {
    await _dio.delete('/api/course-videos/$id');
  }

  // Assignments
  Future<List<Assignment>> getAssignments() async {
    final data = await _cachedGet('/api/assignments', 'assignments');
    final list = data['assignments'] ?? data['data'] ?? [];
    return (list as List).map((e) => Assignment.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Assignment> getAssignmentById(String id) async {
    final response = await _dio.get('/api/assignments/$id');
    final data = response.data;
    return Assignment.fromJson(data['assignment'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  Future<Assignment> createAssignment(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/assignments', data: body);
    final data = response.data;
    return Assignment.fromJson(data['assignment'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  Future<void> submitAssignment(String id, Map<String, dynamic> body) async {
    await _dio.post('/api/assignments/$id/submit', data: body);
  }

  // Attendance
  Future<List<AttendanceSession>> getAttendanceSessions() async {
    final data = await _cachedGet('/api/attendance-sessions', 'sessions');
    final list = data['sessions'] ?? data['data'] ?? [];
    return (list as List).map((e) => AttendanceSession.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> markAttendance(String code, {Map<String, dynamic>? connectionToken}) async {
    final body = <String, dynamic>{'code': code, 'method': 'code_mark'};
    if (connectionToken != null) body['connectionToken'] = connectionToken;
    await _queueablePost('/api/attendance-sessions/mark', body);
  }

  Future<void> markAttendanceQR(String qrToken) async {
    await _queueablePost('/api/attendance-sessions/mark', {
      'qrToken': qrToken,
      'method': 'qr_mark',
    });
  }

  /// Try to reach the ESP32 device on the local classroom WiFi.
  /// Returns device status map or null if unreachable.
  Future<Map<String, dynamic>?> probeESP32({String ip = '192.168.4.1'}) async {
    final localDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 3),
      receiveTimeout: const Duration(seconds: 3),
    ));
    try {
      final resp = await localDio.get('http://$ip/status');
      if (resp.statusCode == 200 && resp.data is Map) {
        return Map<String, dynamic>.from(resp.data as Map);
      }
    } catch (_) {}
    return null;
  }

  /// Submit attendance directly to the ESP32 (S3 firmware only).
  /// Returns true if accepted, false/null otherwise.
  Future<bool> submitToESP32(String code, {
    required String userId,
    required String indexNumber,
    String ip = '192.168.4.1',
  }) async {
    final localDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    ));
    try {
      final resp = await localDio.post(
        'http://$ip/attend',
        data: {'code': code, 'userId': userId, 'indexNumber': indexNumber},
      );
      if (resp.statusCode == 200) {
        final data = resp.data;
        return data is Map && data['error'] == null;
      }
    } on DioException catch (e) {
      // 404/405 = no /attend endpoint (standard firmware) — caller falls through
      if (e.response?.statusCode == 404 || e.response?.statusCode == 405) return false;
    } catch (_) {}
    return false;
  }

  /// Get a connectionToken from the ESP32 (standard firmware).
  Future<Map<String, dynamic>?> getESP32ConnectionToken(String userId, {
    String ip = '192.168.4.1',
  }) async {
    final localDio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 5),
      receiveTimeout: const Duration(seconds: 5),
    ));
    // Try GET /session first, then POST /token
    try {
      final resp = await localDio.get(
        'http://$ip/session',
        queryParameters: {'studentId': userId},
      );
      if (resp.statusCode == 200 && resp.data is Map) {
        final data = Map<String, dynamic>.from(resp.data as Map);
        if (data['sessionId'] != null) return data;
      }
    } catch (_) {}
    try {
      final resp = await localDio.post(
        'http://$ip/token',
        data: {'userId': userId},
      );
      if (resp.statusCode == 200 && resp.data is Map) {
        final data = Map<String, dynamic>.from(resp.data as Map);
        if (data['sessionId'] != null) return data;
      }
    } catch (_) {}
    return null;
  }

  // Users
  Future<List<User>> getUsers() async {
    final response = await _dio.get('/api/users');
    final data = response.data;
    final list = data['users'] ?? data['data'] ?? [];
    return (list as List).map((e) => User.fromJson(e as Map<String, dynamic>)).toList();
  }

  // Admin-level pending approvals
  Future<Map<String, dynamic>> getAdminDashboardData() async {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final results = await Future.wait([
      _dio.get('/api/attendance-sessions?limit=5').catchError((_) => Response(requestOptions: RequestOptions(), data: {'sessions': [], 'pagination': {'total': 0}})),
      _dio.get('/api/users').catchError((_) => Response(requestOptions: RequestOptions(), data: {'users': []})),
      _dio.get('/api/approvals/pending').catchError((_) => Response(requestOptions: RequestOptions(), data: {'pending': []})),
      _dio.get('/api/announcements?limit=5').catchError((_) => Response(requestOptions: RequestOptions(), data: {'announcements': []})),
    ]);
    final sessions = results[0].data['sessions'] ?? [];
    final users = results[1].data['users'] ?? [];
    final pending = results[2].data['pending'] ?? [];
    final announcements = results[3].data['announcements'] ?? [];
    final activeSessions = (sessions as List).where((s) => ['active','live','paused','locked'].contains(s['status'])).length;
    return {
      'sessions': sessions,
      'totalSessions': results[0].data['pagination']?['total'] ?? sessions.length,
      'totalUsers': (users as List).length,
      'activeSessions': activeSessions,
      'pendingApprovals': (pending as List).length,
      'announcements': announcements,
    };
  }

  // Manager today attendance + team data
  Future<Map<String, dynamic>> getManagerDashboardData() async {
    final results = await Future.wait([
      _dio.get('/api/corporate-attendance/today').catchError((_) => Response(requestOptions: RequestOptions(), data: {'records': [], 'summary': {}})),
      _dio.get('/api/performance/team-overview').catchError((_) => Response(requestOptions: RequestOptions(), data: {'overview': []})),
      _dio.get('/api/approvals/pending').catchError((_) => Response(requestOptions: RequestOptions(), data: {'pending': []})),
      _dio.get('/api/announcements?limit=5').catchError((_) => Response(requestOptions: RequestOptions(), data: {'announcements': []})),
    ]);
    return {
      'todayRecords': results[0].data['records'] ?? [],
      'todaySummary': results[0].data['summary'] ?? {},
      'teamOverview': results[1].data['overview'] ?? [],
      'pendingApprovals': results[2].data['pending'] ?? [],
      'announcements': results[3].data['announcements'] ?? [],
    };
  }

  // Employee monthly attendance
  Future<Map<String, dynamic>> getMyMonthlyAttendance() async {
    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month, 1).toIso8601String().substring(0, 10);
    final today = now.toIso8601String().substring(0, 10);
    final response = await _dio.get('/api/corporate-attendance/my?from=$monthStart&to=$today');
    final data = response.data;
    return {'records': data['records'] ?? data['data'] ?? []};
  }

  Future<User> createUser(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/users/create', data: body);
    final data = response.data;
    return User.fromJson(data['user'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  // Quizzes
  Future<List<SnapQuiz>> getQuizzes() async {
    final response = await _dio.get('/api/student/snap-quizzes/quizzes');
    final data = response.data;
    final list = data['quizzes'] ?? data['data'] ?? [];
    return (list as List).map((e) => SnapQuiz.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SnapQuiz> getQuizById(String id) async {
    final response = await _dio.get('/api/student/snap-quizzes/quizzes/$id');
    final data = response.data;
    return SnapQuiz.fromJson(data['quiz'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  // Messages
  Future<List<Message>> getMessages() async {
    final data = await _cachedGet('/api/messages', 'messages');
    final list = data['messages'] ?? data['data'] ?? [];
    return (list as List).map((e) => Message.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> sendMessage(Map<String, dynamic> body) async {
    await _dio.post('/api/messages/send', data: body);
  }

  // Announcements
  Future<List<Announcement>> getAnnouncements() async {
    final data = await _cachedGet('/api/announcements', 'announcements');
    final list = data['announcements'] ?? data['data'] ?? [];
    return (list as List).map((e) => Announcement.fromJson(e as Map<String, dynamic>)).toList();
  }

  // Reports
  Future<Map<String, dynamic>> getReports() async {
    final data = await _cachedGet('/api/reports', 'reports');
    return data as Map<String, dynamic>;
  }

  // Leave Requests
  Future<List<dynamic>> getLeaveRequests() async {
    final data = await _cachedGet('/api/leave-requests', 'leave_requests');
    return data['leaveRequests'] ?? data['data'] ?? [];
  }

  Future<void> approveLeaveRequest(String id) async {
    await _dio.put('/api/leave-requests/$id/approve');
  }

  Future<void> rejectLeaveRequest(String id) async {
    await _dio.put('/api/leave-requests/$id/reject');
  }

  // Timesheets
  Future<List<dynamic>> getTimesheets() async {
    final data = await _cachedGet('/api/timesheets', 'timesheets');
    return data['timesheets'] ?? data['data'] ?? [];
  }

  // Shifts
  Future<List<dynamic>> getShifts() async {
    final data = await _cachedGet('/api/shifts', 'shifts');
    return data['shifts'] ?? data['data'] ?? [];
  }

  // Expenses
  Future<List<dynamic>> getExpenses() async {
    final data = await _cachedGet('/api/expenses', 'expenses');
    return data['expenses'] ?? data['data'] ?? [];
  }

  // HOD
  Future<Map<String, dynamic>> getHodOverview() async {
    final data = await _cachedGet('/api/hod/overview', 'hod_overview');
    return (data['data'] ?? data) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> getPendingApprovals() async {
    final response = await _dio.get('/api/hod/pending-approvals');
    final data = response.data;
    final list = data['data'] ?? data['approvals'] ?? data['users'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<void> approveUser(String id) async {
    await _dio.post('/api/hod/approve/$id');
  }

  Future<void> rejectUser(String id) async {
    await _dio.post('/api/hod/reject/$id');
  }

  Future<void> unlockStudent(String id) async {
    await _dio.post('/api/hod/unlock-student/$id');
  }

  Future<List<Map<String, dynamic>>> getDepartmentStudents() async {
    final response = await _dio.get('/api/hod/students');
    final data = response.data;
    final list = data['data'] ?? data['students'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> getDepartmentLecturers() async {
    final response = await _dio.get('/api/hod/lecturers');
    final data = response.data;
    final list = data['data'] ?? data['lecturers'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> getDepartmentCourses() async {
    final response = await _dio.get('/api/hod/courses');
    final data = response.data;
    final list = data['data'] ?? data['courses'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getDepartmentPerformance() async {
    final response = await _dio.get('/api/hod/performance');
    final data = response.data;
    return (data['data'] ?? data) as Map<String, dynamic>;
  }

  // Timetable
  Future<List<Map<String, dynamic>>> getTimetable() async {
    final data = await _cachedGet('/api/timetable', 'timetable');
    final list = data['timetable'] ?? data['slots'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  // Quiz history — fetch all quizzes (including past) and return submitted ones
  Future<List<Map<String, dynamic>>> getQuizHistory() async {
    final response = await _dio.get('/api/student/snap-quizzes/quizzes', queryParameters: {'showAll': 'true'});
    final data = response.data;
    final list = (data['quizzes'] ?? data['data'] ?? []) as List;
    return list
        .cast<Map<String, dynamic>>()
        .where((q) => q['isSubmitted'] == true)
        .map((q) => {
              'quizTitle': q['title']?.toString() ?? '',
              'score': q['myScore'] ?? 0,
              'maxScore': q['totalMarks'] ?? 0,
              'percentage': q['myPercentage'] ?? 0.0,
              'passed': (q['myPercentage'] as num? ?? 0) >= 50,
              'completedAt': q['submittedAt']?.toString() ?? '',
              'timeTaken': '',
            })
        .toList();
  }

  Future<Map<String, dynamic>> startQuizAttempt(String quizId) async {
    final response = await _dio.post(
      '/api/student/snap-quizzes/quizzes/$quizId/attempts/start',
      data: {'termsAcknowledged': true},
    );
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> submitQuizAttempt({
    required String quizId,
    required String attemptId,
    required String sessionToken,
    required List<Map<String, dynamic>> responses,
  }) async {
    final headers = {'X-Session-Token': sessionToken};
    await _dio.put(
      '/api/student/snap-quizzes/quizzes/$quizId/attempts/$attemptId/responses',
      data: {'responses': responses},
      options: Options(headers: headers),
    );
    final response = await _dio.post(
      '/api/student/snap-quizzes/quizzes/$quizId/attempts/$attemptId/submit',
      data: <String, dynamic>{},
      options: Options(headers: headers),
    );
    return response.data as Map<String, dynamic>;
  }

  // Performance
  Future<Map<String, dynamic>> getPerformance() async {
    final response = await _dio.get('/api/performance/me');
    final data = response.data;
    return (data['data'] ?? data) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getLecturerPerformance() async {
    final response = await _dio.get('/api/performance/lecturer');
    final data = response.data;
    return (data['data'] ?? data) as Map<String, dynamic>;
  }

  // Subscription
  Future<Map<String, dynamic>> getSubscription() async {
    final data = await _cachedGet('/api/subscription/status', 'subscription');
    return (data['subscription'] ?? data['data'] ?? data) as Map<String, dynamic>;
  }

  // Branches
  Future<List<Map<String, dynamic>>> getBranches() async {
    final response = await _dio.get('/api/branches');
    final data = response.data;
    final list = data['branches'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<void> createBranch(Map<String, dynamic> body) async {
    await _dio.post('/api/branches', data: body);
  }

  // Audit logs
  Future<List<Map<String, dynamic>>> getAuditLogs() async {
    final response = await _dio.get('/api/audit-logs');
    final data = response.data;
    final list = data['logs'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  // Sign-in/out (corporate)
  Future<Map<String, dynamic>> getSignInStatus() async {
    final response = await _dio.get('/api/sign-in-out/status');
    final data = response.data;
    return (data['data'] ?? data) as Map<String, dynamic>;
  }

  Future<void> signIn() async {
    await _queueablePost('/api/sign-in-out/sign-in', {});
  }

  Future<void> signOut() async {
    await _queueablePost('/api/sign-in-out/sign-out', {});
  }

  Future<List<Map<String, dynamic>>> getCorporateAttendance() async {
    final response = await _dio.get('/api/sign-in-out/attendance');
    final data = response.data;
    final list = data['attendance'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  // Employee-specific
  Future<List<Map<String, dynamic>>> getMyAttendance() async {
    final response = await _dio.get('/api/sign-in-out/my-attendance');
    final data = response.data;
    final list = data['attendance'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getMyShift() async {
    final response = await _dio.get('/api/shifts/my-shift');
    final data = response.data;
    return (data['shift'] ?? data['data'] ?? data) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> getMyLeaves() async {
    final response = await _dio.get('/api/leave-requests/my');
    final data = response.data;
    final list = data['leaveRequests'] ?? data['data'] ?? [];
    return (list as List).cast<Map<String, dynamic>>();
  }

  Future<void> createLeaveRequest(Map<String, dynamic> body) async {
    await _queueablePost('/api/leave-requests', body);
  }

  Future<void> createExpense(Map<String, dynamic> body) async {
    await _queueablePost('/api/expenses', body);
  }

  Future<void> createShift(Map<String, dynamic> body) async {
    await _queueablePost('/api/shifts', body);
  }

  Future<void> createAnnouncement(Map<String, dynamic> body) async {
    await _queueablePost('/api/announcements', body);
  }

  // Profile management
  Future<User> updateProfile(Map<String, dynamic> body) async {
    final response = await _dio.put('/api/auth/update-profile', data: body);
    final data = response.data;
    final userData = data['user'] ?? data['data'] ?? data;
    return User.fromJson(userData as Map<String, dynamic>);
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _dio.post('/api/auth/change-password', data: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  // Student combined dashboard data
  Future<Map<String, dynamic>> getStudentDashboardData() async {
    final results = await Future.wait([
      _dio.get('/api/attendance-sessions/my-attendance?limit=5').catchError((_) => Response(requestOptions: RequestOptions(), data: {'records': [], 'pagination': {'total': 0}})),
      _dio.get('/api/courses').catchError((_) => Response(requestOptions: RequestOptions(), data: {'courses': []})),
      _dio.get('/api/student/snap-quizzes/quizzes?showAll=true').catchError((_) => Response(requestOptions: RequestOptions(), data: {'quizzes': []})),
      _dio.get('/api/attendance-sessions/active').catchError((_) => Response(requestOptions: RequestOptions(), data: {'session': null})),
      _dio.get('/api/student/assignments/upcoming').catchError((_) => Response(requestOptions: RequestOptions(), data: {'assignments': []})),
    ]);
    final records = (results[0].data['records'] ?? results[0].data['data'] ?? []) as List;
    final totalCheckins = results[0].data['pagination']?['total'] ?? records.length;
    final presentCount = records.where((r) => r['status'] == 'present').length;
    final attendanceRate = records.isNotEmpty ? (presentCount / records.length * 100).round() : 0;
    return {
      'totalCheckins': totalCheckins,
      'attendanceRate': attendanceRate,
      'attendanceRecords': records,
      'enrolledCourses': ((results[1].data['courses'] ?? results[1].data['data'] ?? []) as List).length,
      'quizzesTaken': ((results[2].data['quizzes'] ?? results[2].data['data'] ?? []) as List).length,
      'activeSession': results[3].data['session'],
      'upcomingAssignments': (results[4].data['assignments'] ?? results[4].data['data'] ?? []) as List,
    };
  }

  // Lecturer combined dashboard data
  Future<Map<String, dynamic>> getLecturerDashboardData() async {
    final results = await Future.wait([
      _dio.get('/api/attendance-sessions?limit=5').catchError((_) => Response(requestOptions: RequestOptions(), data: {'sessions': [], 'pagination': {'total': 0}})),
      _dio.get('/api/courses').catchError((_) => Response(requestOptions: RequestOptions(), data: {'courses': []})),
      _dio.get('/api/lecturer/snap-quizzes').catchError((_) => Response(requestOptions: RequestOptions(), data: {'quizzes': []})),
      _dio.get('/api/meetings?limit=10').catchError((_) => Response(requestOptions: RequestOptions(), data: {'data': []})),
    ]);
    final courseList = (results[1].data['courses'] ?? results[1].data['data'] ?? []) as List;
    final totalStudents = courseList.fold<int>(0, (sum, c) => sum + ((c['enrolledStudents'] as List?)?.length ?? 0));
    final meetingsList = (results[3].data['data'] ?? results[3].data['meetings'] ?? []) as List;
    final upcoming = meetingsList.where((m) => m['status'] == 'scheduled' || m['status'] == 'live').toList();
    upcoming.sort((a, b) {
      final aDate = DateTime.tryParse(a['scheduledStart']?.toString() ?? '') ?? DateTime(2099);
      final bDate = DateTime.tryParse(b['scheduledStart']?.toString() ?? '') ?? DateTime(2099);
      return aDate.compareTo(bDate);
    });
    return {
      'sessions': results[0].data['sessions'] ?? [],
      'totalSessions': results[0].data['pagination']?['total'] ?? (results[0].data['sessions'] as List?)?.length ?? 0,
      'activeCourses': courseList.length,
      'totalStudents': totalStudents,
      'quizzesCreated': ((results[2].data['quizzes'] ?? results[2].data['data'] ?? []) as List).length,
      'upcomingMeetings': upcoming.take(5).toList(),
    };
  }

  // Student dashboard stats  (attendance %, active assignments, course count)
  Future<Map<String, dynamic>> getStudentStats() async {
    final data = await _cachedGet('/api/students/dashboard-stats', 'student_stats');
    return (data['stats'] ?? data['data'] ?? data) as Map<String, dynamic>;
  }

  Future<void> saveToken(String token) async {
    await _storage.write(key: 'auth_token', value: token);
  }

  Future<String?> getToken() async {
    return _storage.read(key: 'auth_token');
  }

  Future<void> clearToken() async {
    await _storage.delete(key: 'auth_token');
  }
}

final apiService = ApiService();
