class Course {
  final String id;
  final String title;
  final String? description;
  final String? code;
  final String? instructorId;
  final String? instructorName;
  final int? studentCount;
  final String? status;
  final DateTime? createdAt;
  final String? thumbnail;

  const Course({
    required this.id,
    required this.title,
    this.description,
    this.code,
    this.instructorId,
    this.instructorName,
    this.studentCount,
    this.status,
    this.createdAt,
    this.thumbnail,
  });

  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      code: json['code']?.toString() ?? json['courseCode']?.toString(),
      instructorId: json['instructorId']?.toString() ??
          (json['instructor'] is Map
              ? json['instructor']['_id']?.toString()
              : json['instructor']?.toString()),
      instructorName: json['instructorName']?.toString() ??
          (json['instructor'] is Map
              ? json['instructor']['name']?.toString()
              : null),
      studentCount: json['studentCount'] as int? ??
          (json['students'] is List ? (json['students'] as List).length : null),
      status: json['status']?.toString() ?? 'active',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      thumbnail: json['thumbnail']?.toString(),
    );
  }
}
