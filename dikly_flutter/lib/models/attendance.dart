class AttendanceSession {
  final String id;
  final String title;
  final String? courseId;
  final String? courseName;
  final String status;
  final String? code;
  final DateTime? startTime;
  final DateTime? endTime;
  final int? totalStudents;
  final int? presentCount;
  final String? myStatus;

  const AttendanceSession({
    required this.id,
    required this.title,
    this.courseId,
    this.courseName,
    required this.status,
    this.code,
    this.startTime,
    this.endTime,
    this.totalStudents,
    this.presentCount,
    this.myStatus,
  });

  factory AttendanceSession.fromJson(Map<String, dynamic> json) {
    return AttendanceSession(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? json['sessionName']?.toString() ?? '',
      courseId: json['courseId']?.toString() ??
          (json['course'] is Map
              ? json['course']['_id']?.toString()
              : json['course']?.toString()),
      courseName: json['courseName']?.toString() ??
          (json['course'] is Map
              ? json['course']['title']?.toString()
              : null),
      status: json['status']?.toString() ?? 'closed',
      code: json['code']?.toString() ?? json['attendanceCode']?.toString(),
      startTime: json['startTime'] != null
          ? DateTime.tryParse(json['startTime'].toString())
          : null,
      endTime: json['endTime'] != null
          ? DateTime.tryParse(json['endTime'].toString())
          : null,
      totalStudents: json['totalStudents'] as int?,
      presentCount: json['presentCount'] as int?,
      myStatus: json['myStatus']?.toString() ?? json['attendanceStatus']?.toString(),
    );
  }

  bool get isOpen => status == 'open' || status == 'active';
  bool get isMarked => myStatus == 'present' || myStatus == 'marked';
}

class AttendanceRecord {
  final String id;
  final String userId;
  final String userName;
  final String sessionId;
  final String status;
  final DateTime? markedAt;

  const AttendanceRecord({
    required this.id,
    required this.userId,
    required this.userName,
    required this.sessionId,
    required this.status,
    this.markedAt,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ??
          (json['user'] is Map ? json['user']['_id']?.toString() : json['user']?.toString()) ?? '',
      userName: json['userName']?.toString() ??
          (json['user'] is Map ? json['user']['name']?.toString() : '') ?? '',
      sessionId: json['sessionId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'absent',
      markedAt: json['markedAt'] != null
          ? DateTime.tryParse(json['markedAt'].toString())
          : null,
    );
  }
}
