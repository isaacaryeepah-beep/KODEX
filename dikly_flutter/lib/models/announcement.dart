class Announcement {
  final String id;
  final String title;
  final String content;
  final String? author;
  final String? authorName;
  final String? targetRole;
  final String priority;
  final DateTime? createdAt;
  final DateTime? expiresAt;
  final bool isRead;

  const Announcement({
    required this.id,
    required this.title,
    required this.content,
    this.author,
    this.authorName,
    this.targetRole,
    this.priority = 'normal',
    this.createdAt,
    this.expiresAt,
    this.isRead = false,
  });

  factory Announcement.fromJson(Map<String, dynamic> json) {
    return Announcement(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      content: json['content']?.toString() ?? json['message']?.toString() ?? '',
      author: json['author']?.toString() ??
          (json['createdBy'] is Map
              ? json['createdBy']['_id']?.toString()
              : json['createdBy']?.toString()),
      authorName: json['authorName']?.toString() ??
          (json['createdBy'] is Map
              ? json['createdBy']['name']?.toString()
              : null),
      targetRole: json['targetRole']?.toString() ?? json['audience']?.toString(),
      priority: json['priority']?.toString() ?? 'normal',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'].toString())
          : null,
      isRead: json['isRead'] as bool? ?? false,
    );
  }

  bool get isUrgent => priority == 'urgent' || priority == 'high';
  bool get isExpired =>
      expiresAt != null && DateTime.now().isAfter(expiresAt!);
}
