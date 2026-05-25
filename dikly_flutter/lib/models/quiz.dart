class SnapQuiz {
  final String id;
  final String title;
  final String? description;
  final String? courseId;
  final String? courseName;
  final int? timeLimit;
  final int? totalQuestions;
  final int? totalMarks;
  final String status;
  final DateTime? startTime;
  final DateTime? endTime;
  final String? myStatus;
  final double? myScore;
  final List<QuizQuestion> questions;

  const SnapQuiz({
    required this.id,
    required this.title,
    this.description,
    this.courseId,
    this.courseName,
    this.timeLimit,
    this.totalQuestions,
    this.totalMarks,
    this.status = 'active',
    this.startTime,
    this.endTime,
    this.myStatus,
    this.myScore,
    this.questions = const [],
  });

  factory SnapQuiz.fromJson(Map<String, dynamic> json) {
    final questionList = json['questions'] as List<dynamic>?;
    return SnapQuiz(
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
      timeLimit: json['timeLimit'] as int? ?? json['duration'] as int?,
      totalQuestions: json['totalQuestions'] as int? ??
          (questionList?.length),
      totalMarks: json['totalMarks'] as int? ?? json['maxScore'] as int?,
      status: json['status']?.toString() ?? 'active',
      startTime: json['startTime'] != null
          ? DateTime.tryParse(json['startTime'].toString())
          : null,
      endTime: json['endTime'] != null
          ? DateTime.tryParse(json['endTime'].toString())
          : null,
      myStatus: json['myStatus']?.toString() ?? json['submissionStatus']?.toString(),
      myScore: (json['myScore'] ?? json['score'])?.toDouble(),
      questions: questionList
              ?.map((q) => QuizQuestion.fromJson(q as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  bool get isActive => status == 'active' || status == 'open';
  bool get isCompleted => myStatus == 'submitted' || myStatus == 'completed';
}

class QuizQuestion {
  final String id;
  final String text;
  final List<String> options;
  final int? correctIndex;
  final String? explanation;

  const QuizQuestion({
    required this.id,
    required this.text,
    required this.options,
    this.correctIndex,
    this.explanation,
  });

  factory QuizQuestion.fromJson(Map<String, dynamic> json) {
    final opts = json['options'] as List<dynamic>? ?? [];
    return QuizQuestion(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      text: json['text']?.toString() ?? json['question']?.toString() ?? '',
      options: opts.map((o) => o.toString()).toList(),
      correctIndex: json['correctIndex'] as int? ?? json['answer'] as int?,
      explanation: json['explanation']?.toString(),
    );
  }
}
