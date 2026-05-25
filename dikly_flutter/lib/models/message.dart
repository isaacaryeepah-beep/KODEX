class Message {
  final String id;
  final String senderId;
  final String? senderName;
  final String? senderAvatar;
  final String receiverId;
  final String? receiverName;
  final String content;
  final bool isRead;
  final DateTime? createdAt;
  final String? conversationId;

  const Message({
    required this.id,
    required this.senderId,
    this.senderName,
    this.senderAvatar,
    required this.receiverId,
    this.receiverName,
    required this.content,
    this.isRead = false,
    this.createdAt,
    this.conversationId,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      senderId: json['senderId']?.toString() ??
          (json['sender'] is Map
              ? json['sender']['_id']?.toString()
              : json['sender']?.toString()) ??
          '',
      senderName: json['senderName']?.toString() ??
          (json['sender'] is Map ? json['sender']['name']?.toString() : null),
      senderAvatar: json['senderAvatar']?.toString() ??
          (json['sender'] is Map ? json['sender']['avatar']?.toString() : null),
      receiverId: json['receiverId']?.toString() ??
          (json['receiver'] is Map
              ? json['receiver']['_id']?.toString()
              : json['receiver']?.toString()) ??
          '',
      receiverName: json['receiverName']?.toString() ??
          (json['receiver'] is Map
              ? json['receiver']['name']?.toString()
              : null),
      content: json['content']?.toString() ?? json['message']?.toString() ?? '',
      isRead: json['isRead'] as bool? ?? json['read'] as bool? ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      conversationId: json['conversationId']?.toString(),
    );
  }
}

class Conversation {
  final String id;
  final String participantId;
  final String participantName;
  final String? participantAvatar;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;

  const Conversation({
    required this.id,
    required this.participantId,
    required this.participantName,
    this.participantAvatar,
    this.lastMessage,
    this.lastMessageAt,
    this.unreadCount = 0,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final participant = json['participant'] as Map<String, dynamic>?;
    return Conversation(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      participantId: participant?['_id']?.toString() ?? json['participantId']?.toString() ?? '',
      participantName: participant?['name']?.toString() ?? json['participantName']?.toString() ?? '',
      participantAvatar: participant?['avatar']?.toString() ?? json['participantAvatar']?.toString(),
      lastMessage: json['lastMessage']?.toString(),
      lastMessageAt: json['lastMessageAt'] != null
          ? DateTime.tryParse(json['lastMessageAt'].toString())
          : null,
      unreadCount: json['unreadCount'] as int? ?? 0,
    );
  }
}
