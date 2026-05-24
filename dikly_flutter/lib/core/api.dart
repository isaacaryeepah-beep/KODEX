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

const String _baseUrl = 'https://dikly.sbs';
const FlutterSecureStorage _storage = FlutterSecureStorage();

class ApiService {
  late final Dio _dio;

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
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

  // Auth
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    required String loginRole,
    required String portalMode,
    required String deviceId,
  }) async {
    final response = await _dio.post('/api/auth/login', data: {
      'email': email,
      'password': password,
      'loginRole': loginRole,
      'portalMode': portalMode,
      'deviceId': deviceId,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<User> getMe() async {
    final response = await _dio.get('/api/auth/me');
    final data = response.data;
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
    final response = await _dio.get('/api/meetings');
    final data = response.data;
    final list = data['data'] ?? data['meetings'] ?? [];
    return (list as List).map((e) => Meeting.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Meeting>> getUpcomingMeetings() async {
    final response = await _dio.get('/api/meetings/upcoming');
    final data = response.data;
    final list = data['data'] ?? data['meetings'] ?? [];
    return (list as List).map((e) => Meeting.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Meeting>> getLiveMeetings() async {
    final response = await _dio.get('/api/meetings/live');
    final data = response.data;
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
    final response = await _dio.get('/api/courses');
    final data = response.data;
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
    final response = await _dio.get('/api/assignments');
    final data = response.data;
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
    final response = await _dio.get('/api/attendance-sessions');
    final data = response.data;
    final list = data['sessions'] ?? data['data'] ?? [];
    return (list as List).map((e) => AttendanceSession.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> markAttendance(String code) async {
    await _dio.post('/api/attendance-sessions/mark', data: {
      'code': code,
      'method': 'code_mark',
    });
  }

  // Users
  Future<List<User>> getUsers() async {
    final response = await _dio.get('/api/users');
    final data = response.data;
    final list = data['users'] ?? data['data'] ?? [];
    return (list as List).map((e) => User.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<User> createUser(Map<String, dynamic> body) async {
    final response = await _dio.post('/api/users/create', data: body);
    final data = response.data;
    return User.fromJson(data['user'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  // Quizzes
  Future<List<SnapQuiz>> getQuizzes() async {
    final response = await _dio.get('/api/snap-quizzes');
    final data = response.data;
    final list = data['quizzes'] ?? data['data'] ?? [];
    return (list as List).map((e) => SnapQuiz.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SnapQuiz> getQuizById(String id) async {
    final response = await _dio.get('/api/snap-quizzes/$id');
    final data = response.data;
    return SnapQuiz.fromJson(data['quiz'] ?? data['data'] ?? data as Map<String, dynamic>);
  }

  // Messages
  Future<List<Message>> getMessages() async {
    final response = await _dio.get('/api/messages');
    final data = response.data;
    final list = data['messages'] ?? data['data'] ?? [];
    return (list as List).map((e) => Message.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> sendMessage(Map<String, dynamic> body) async {
    await _dio.post('/api/messages/send', data: body);
  }

  // Announcements
  Future<List<Announcement>> getAnnouncements() async {
    final response = await _dio.get('/api/announcements');
    final data = response.data;
    final list = data['announcements'] ?? data['data'] ?? [];
    return (list as List).map((e) => Announcement.fromJson(e as Map<String, dynamic>)).toList();
  }

  // Reports
  Future<Map<String, dynamic>> getReports() async {
    final response = await _dio.get('/api/reports');
    return response.data as Map<String, dynamic>;
  }

  // Leave Requests
  Future<List<dynamic>> getLeaveRequests() async {
    final response = await _dio.get('/api/leave-requests');
    final data = response.data;
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
    final response = await _dio.get('/api/timesheets');
    final data = response.data;
    return data['timesheets'] ?? data['data'] ?? [];
  }

  // Shifts
  Future<List<dynamic>> getShifts() async {
    final response = await _dio.get('/api/shifts');
    final data = response.data;
    return data['shifts'] ?? data['data'] ?? [];
  }

  // Expenses
  Future<List<dynamic>> getExpenses() async {
    final response = await _dio.get('/api/expenses');
    final data = response.data;
    return data['expenses'] ?? data['data'] ?? [];
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
