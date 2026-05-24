class CourseVideo {
  final String id;
  final String courseId;
  final String title;
  final String? description;
  final String url;
  final String? thumbnailUrl;
  final int? duration;
  final int? order;
  final DateTime? createdAt;
  final String? uploadedBy;

  const CourseVideo({
    required this.id,
    required this.courseId,
    required this.title,
    this.description,
    required this.url,
    this.thumbnailUrl,
    this.duration,
    this.order,
    this.createdAt,
    this.uploadedBy,
  });

  factory CourseVideo.fromJson(Map<String, dynamic> json) {
    return CourseVideo(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      courseId: json['courseId']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString(),
      url: json['url']?.toString() ?? json['videoUrl']?.toString() ?? '',
      thumbnailUrl: json['thumbnailUrl']?.toString() ?? json['thumbnail']?.toString(),
      duration: json['duration'] as int?,
      order: json['order'] as int?,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      uploadedBy: json['uploadedBy']?.toString(),
    );
  }

  String get videoType {
    final lower = url.toLowerCase();
    if (lower.contains('youtube.com') || lower.contains('youtu.be')) {
      return 'youtube';
    } else if (lower.contains('vimeo.com')) {
      return 'vimeo';
    } else if (lower.contains('drive.google.com')) {
      return 'drive';
    } else if (lower.contains('loom.com')) {
      return 'loom';
    }
    return 'other';
  }

  String get embedUrl {
    switch (videoType) {
      case 'youtube':
        final videoId = _extractYoutubeId(url);
        return videoId != null
            ? 'https://www.youtube.com/embed/$videoId'
            : url;
      case 'vimeo':
        final videoId = _extractVimeoId(url);
        return videoId != null
            ? 'https://player.vimeo.com/video/$videoId'
            : url;
      default:
        return url;
    }
  }

  String? _extractYoutubeId(String url) {
    final regExp = RegExp(
        r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})');
    final match = regExp.firstMatch(url);
    return match?.group(1);
  }

  String? _extractVimeoId(String url) {
    final regExp = RegExp(r'vimeo\.com\/(\d+)');
    final match = regExp.firstMatch(url);
    return match?.group(1);
  }
}
