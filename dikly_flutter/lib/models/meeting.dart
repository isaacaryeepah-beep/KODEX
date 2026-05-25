class Meeting {
  final String id;
  final String title;
  final String meetingType;
  final String status;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? actualStart;
  final DateTime? actualEnd;
  final String? linkedCourseId;
  final bool openToCompany;
  final String? createdBy;
  final String? meetingUrl;
  final int? participantCount;

  const Meeting({
    required this.id,
    required this.title,
    required this.meetingType,
    required this.status,
    this.scheduledStart,
    this.scheduledEnd,
    this.actualStart,
    this.actualEnd,
    this.linkedCourseId,
    this.openToCompany = false,
    this.createdBy,
    this.meetingUrl,
    this.participantCount,
  });

  factory Meeting.fromJson(Map<String, dynamic> json) {
    return Meeting(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      meetingType: json['meetingType']?.toString() ?? 'general',
      status: json['status']?.toString() ?? 'scheduled',
      scheduledStart: json['scheduledStart'] != null
          ? DateTime.tryParse(json['scheduledStart'].toString())
          : null,
      scheduledEnd: json['scheduledEnd'] != null
          ? DateTime.tryParse(json['scheduledEnd'].toString())
          : null,
      actualStart: json['actualStart'] != null
          ? DateTime.tryParse(json['actualStart'].toString())
          : null,
      actualEnd: json['actualEnd'] != null
          ? DateTime.tryParse(json['actualEnd'].toString())
          : null,
      linkedCourseId: json['linkedCourseId']?.toString(),
      openToCompany: json['openToCompany'] as bool? ?? false,
      createdBy: json['createdBy']?.toString(),
      meetingUrl: json['meetingUrl']?.toString(),
      participantCount: json['participantCount'] as int?,
    );
  }

  bool get isLive => status == 'live' || status == 'active';
  bool get isScheduled => status == 'scheduled';
  bool get isEnded => status == 'ended' || status == 'completed';

  String get statusLabel {
    switch (status) {
      case 'live':
      case 'active':
        return 'Live';
      case 'scheduled':
        return 'Scheduled';
      case 'ended':
      case 'completed':
        return 'Ended';
      default:
        return status;
    }
  }
}
