import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/message.dart';
import '../../models/user.dart';
import '../../widgets/app_shell.dart';

import '../../widgets/ds/dikly_ds.dart';

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  List<Message> _messages = [];
  List<User> _users = [];
  bool _loading = true;
  String? _error;
  String? _activeConversationId;
  List<Message> _conversationMessages = [];
  final _messageController = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        apiService.getMessages(),
        apiService.getUsers(),
      ]);
      setState(() {
        _messages = results[0] as List<Message>;
        _users = results[1] as List<User>;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  // Group messages into conversations
  List<Map<String, dynamic>> get _conversations {
    final currentUser = ref.read(currentUserProvider);
    final Map<String, Map<String, dynamic>> convMap = {};

    for (final msg in _messages) {
      final otherId = msg.senderId == currentUser?.id ? msg.receiverId : msg.senderId;
      final otherName = msg.senderId == currentUser?.id ? (msg.receiverName ?? 'User') : (msg.senderName ?? 'User');

      if (!convMap.containsKey(otherId)) {
        convMap[otherId] = {
          'userId': otherId,
          'name': otherName,
          'lastMessage': msg.content,
          'lastTime': msg.createdAt,
          'unread': 0,
        };
      } else {
        final existing = convMap[otherId]!;
        if (msg.createdAt != null && (existing['lastTime'] == null || msg.createdAt!.isAfter(existing['lastTime'] as DateTime))) {
          existing['lastMessage'] = msg.content;
          existing['lastTime'] = msg.createdAt;
        }
      }
      if (msg.senderId != currentUser?.id && !msg.isRead) {
        convMap[otherId]!['unread'] = (convMap[otherId]!['unread'] as int) + 1;
      }
    }

    final list = convMap.values.toList();
    list.sort((a, b) {
      final aTime = a['lastTime'] as DateTime?;
      final bTime = b['lastTime'] as DateTime?;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime.compareTo(aTime);
    });
    return list;
  }

  void _openConversation(String userId, String name) {
    final currentUser = ref.read(currentUserProvider);
    final convMessages = _messages.where((m) =>
      (m.senderId == currentUser?.id && m.receiverId == userId) ||
      (m.receiverId == currentUser?.id && m.senderId == userId)
    ).toList();
    convMessages.sort((a, b) => (a.createdAt ?? DateTime(0)).compareTo(b.createdAt ?? DateTime(0)));

    setState(() {
      _activeConversationId = userId;
      _conversationMessages = convMessages;
    });
  }

  Future<void> _sendMessage() async {
    if (_messageController.text.trim().isEmpty || _activeConversationId == null) return;
    setState(() => _sending = true);
    try {
      await apiService.sendMessage({
        'receiverId': _activeConversationId,
        'content': _messageController.text.trim(),
      });
      _messageController.clear();
      await _loadData();
      _openConversation(_activeConversationId!, '');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _showNewMessageDialog() {
    String? selectedUserId;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('New Message'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(labelText: 'Select Recipient'),
                items: _users.map((u) => DropdownMenuItem(value: u.id, child: Text(u.name))).toList(),
                onChanged: (v) => setDialogState(() => selectedUserId = v),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: selectedUserId == null ? null : () {
                Navigator.pop(ctx);
                final user = _users.firstWhere((u) => u.id == selectedUserId);
                _openConversation(user.id, user.name);
              },
              child: const Text('Start Chat'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_activeConversationId != null) {
      final convUser = _users.firstWhere(
        (u) => u.id == _activeConversationId,
        orElse: () => User(id: _activeConversationId!, name: 'User', email: '', role: ''),
      );
      return _buildChatScreen(convUser);
    }

    return AppShell(
      title: 'Messages',
      floatingActionButton: FloatingActionButton(
        onPressed: _showNewMessageDialog,
        backgroundColor: DiklyColors.primary,
        child: const Icon(Icons.edit_rounded, color: Colors.white),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Messages',
              subtitle: 'Your conversations',
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                          const SizedBox(height: 12),
                          const Text(
                            'Unable to load data. Pull down to refresh.',
                            style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                        ],
                      ))
                    : _conversations.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.message_outlined,
                            title: 'No conversations yet',
                            subtitle: 'Start a conversation',
                            buttonLabel: 'New Message',
                            onButton: _showNewMessageDialog,
                          )
                        : RefreshIndicator(
                            onRefresh: _loadData,
                            child: ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _conversations.length,
                              itemBuilder: (context, index) {
                                final conv = _conversations[index];
                                return _ConversationTile(
                                  name: conv['name'] as String,
                                  lastMessage: conv['lastMessage'] as String,
                                  time: conv['lastTime'] as DateTime?,
                                  unreadCount: conv['unread'] as int,
                                  onTap: () => _openConversation(conv['userId'] as String, conv['name'] as String),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildChatScreen(User convUser) {
    final currentUser = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () => setState(() => _activeConversationId = null)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: DiklyColors.border, height: 1),
        ),
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: DiklyColors.primary.withOpacity(0.1),
              child: Text(
                convUser.name.isNotEmpty ? convUser.name[0].toUpperCase() : 'U',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.primary),
              ),
            ),
            const SizedBox(width: 10),
            Text(convUser.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: DiklyColors.text)),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _conversationMessages.isEmpty
                ? const Center(child: Text('No messages yet. Start the conversation!', style: TextStyle(color: DiklyColors.textSecondary)))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    reverse: true,
                    itemCount: _conversationMessages.length,
                    itemBuilder: (ctx, i) {
                      final msg = _conversationMessages[_conversationMessages.length - 1 - i];
                      final isMe = msg.senderId == currentUser?.id;
                      return _MessageBubble(message: msg, isMe: isMe);
                    },
                  ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              color: DiklyColors.surface,
              border: Border(top: BorderSide(color: DiklyColors.border)),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      maxLines: null,
                      decoration: InputDecoration(
                        hintText: 'Type a message...',
                        hintStyle: const TextStyle(color: DiklyColors.textMuted),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        filled: true,
                        fillColor: DiklyColors.background,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(color: DiklyColors.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(color: DiklyColors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(color: DiklyColors.primary, width: 1.5),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: const BoxDecoration(color: DiklyColors.primary, shape: BoxShape.circle),
                    child: IconButton(
                      icon: _sending
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.send_rounded, color: Colors.white),
                      onPressed: _sending ? null : _sendMessage,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final String name;
  final String lastMessage;
  final DateTime? time;
  final int unreadCount;
  final VoidCallback onTap;

  const _ConversationTile({
    required this.name,
    required this.lastMessage,
    this.time,
    required this.unreadCount,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isNotEmpty
        ? name.trim().split(' ').map((w) => w.isNotEmpty ? w[0].toUpperCase() : '').take(2).join()
        : 'U';

    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Row(
        children: [
          // Avatar (initials circle)
          CircleAvatar(
            radius: 24,
            backgroundColor: DiklyColors.primary.withOpacity(0.1),
            child: Text(
              initials,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.primary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.text),
                ),
                const SizedBox(height: 3),
                Text(
                  lastMessage,
                  style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (time != null)
                Text(
                  DateFormat('h:mm a').format(time!),
                  style: const TextStyle(fontSize: 11, color: DiklyColors.textMuted),
                ),
              if (unreadCount > 0) ...[
                const SizedBox(height: 4),
                Container(
                  width: 20,
                  height: 20,
                  decoration: const BoxDecoration(color: DiklyColors.primary, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      '$unreadCount',
                      style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;
  final bool isMe;

  const _MessageBubble({required this.message, required this.isMe});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        decoration: BoxDecoration(
          color: isMe ? DiklyColors.primary : DiklyColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isMe ? 16 : 4),
            bottomRight: Radius.circular(isMe ? 4 : 16),
          ),
          border: isMe ? null : Border.all(color: DiklyColors.border),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              message.content,
              style: TextStyle(
                fontSize: 14,
                color: isMe ? Colors.white : DiklyColors.text,
              ),
            ),
            if (message.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                DateFormat('h:mm a').format(message.createdAt!),
                style: TextStyle(
                  fontSize: 10,
                  color: isMe ? Colors.white60 : DiklyColors.textMuted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
