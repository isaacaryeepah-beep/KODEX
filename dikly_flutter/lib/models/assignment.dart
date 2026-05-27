class Assignment {
  final String id;
  final String title;
  final String? description;
  final String? courseId;
  final String? courseName;
  final DateTime? dueDate;
  final int? totalMarks;
  int get maxScore => totalMarks ?? 100;
  final String status;
  final String? submissionStatus;
  final double? grade;
  final String? feedback;
  final DateTime? submittedAt;
  final DateTime? createdAt;

  const Assignment({
    required this.id,
    required this.title,
    this.description,
    this.courseId,
    this.courseName,
    this.dueDate,
    this.totalMarks,
    this.status = 'active',
    this.submissionStatus,
    this.grade,
    this.feedback,
    this.submittedAt,
    this.createdAt,
  });

  factory Assignment.fromJson(Map<String, dynamic> json) {
    return Assignment(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      courseId: json['courseId']?.toString() ??
          (json['course'] is Map
              ? json['course']['_id']?.toString()
              : json['course']?.toString()),
      courseName: json['courseName']?.toString() ??
          (json['course'] is Map
              ? json['course']['title']?.toString()
              : null),
      dueDate: json['dueDate'] != null
          ? DateTime.tryParse(json['dueDate'].toString())
          : null,
      totalMarks: json['totalMarks'] as int? ?? json['maxScore'] as int?,
      status: json['status']?.toString() ?? 'active',
      submissionStatus: json['submissionStatus']?.toString() ??
          json['mySubmission']?['status']?.toString(),
      grade: (json['grade'] ?? json['mySubmission']?['grade'])?.toDouble(),
      feedback: json['feedback']?.toString() ??
          json['mySubmission']?['feedback']?.toString(),
      submittedAt: json['submittedAt'] != null
          ? DateTime.tryParse(json['submittedAt'].toString())
          : (json['mySubmission']?['submittedAt'] != null
              ? DateTime.tryParse(json['mySubmission']['submittedAt'].toString())
              : null),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  bool get isSubmitted =>
      submissionStatus == 'submitted' || submissionStatus == 'graded';
  bool get isOverdue =>
      dueDate != null && DateTime.now().isAfter(dueDate!) && !isSubmitted;
}
