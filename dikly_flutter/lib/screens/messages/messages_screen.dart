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
  List<Conversation> _conversations = [];
  bool _loading = true;
  String? _error;
  String _searchQuery = '';

  Conversation? _activeConversation;
  List<Message> _conversationMessages = [];
  bool _messagesLoading = false;
  final _messageController = TextEditingController();
  bool _sending = false;

  // For new conversation dialog
  List<User> _users = [];
  bool _usersLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadConversations();
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadConversations() async {
    setState(() { _loading = true; _error = null; });
    try {
      final convs = await apiService.getConversations();
      setState(() {
        _conversations = convs;
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _openConversation(Conversation conv) async {
    setState(() {
      _activeConversation = conv;
      _messagesLoading = true;
      _conversationMessages = [];
    });
    try {
      final msgs = await apiService.getConversationMessages(conv.id);
      if (mounted) {
        setState(() {
          _conversationMessages = msgs;
          _messagesLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _messagesLoading = false);
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _activeConversation == null) return;
    setState(() => _sending = true);
    try {
      await apiService.sendMessageToConversation(_activeConversation!.id, text);
      _messageController.clear();
      final msgs = await apiService.getConversationMessages(_activeConversation!.id);
      if (mounted) setState(() => _conversationMessages = msgs);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _loadUsersIfNeeded() async {
    if (_usersLoaded) return;
    try {
      final users = await apiService.getUsers();
      setState(() {
        _users = users;
        _usersLoaded = true;
      });
    } catch (_) {}
  }

  void _showNewMessageDialog() async {
    await _loadUsersIfNeeded();
    if (!mounted) return;

    String? selectedUserId;
    final msgController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: DiklyColors.surface,
          title: const Text('New Message', style: TextStyle(color: DiklyColors.text)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                dropdownColor: DiklyColors.surface,
                decoration: const InputDecoration(
                  labelText: 'Select Recipient',
                  labelStyle: TextStyle(color: DiklyColors.textSecondary),
                ),
                items: _users.map((u) => DropdownMenuItem(
                  value: u.id,
                  child: Text(u.name, style: const TextStyle(color: DiklyColors.text)),
                )).toList(),
                onChanged: (v) => setDialogState(() => selectedUserId = v),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: msgController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Message',
                  labelStyle: TextStyle(color: DiklyColors.textSecondary),
                  hintText: 'Type your message...',
                  hintStyle: TextStyle(color: DiklyColors.textMuted),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: selectedUserId == null || msgController.text.trim().isEmpty ? null : () async {
                Navigator.pop(ctx);
                try {
                  final conv = await apiService.startConversation(selectedUserId!, msgController.text.trim());
                  await _loadConversations();
                  if (mounted) _openConversation(conv);
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
                    );
                  }
                }
              },
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
  }

  void _startHodRequest() async {
    await _loadUsersIfNeeded();
    if (!mounted) return;

    final hods = _users.where((u) => u.role == 'hod').toList();
    if (hods.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No HOD found in your institution')),
      );
      return;
    }
    final hod = hods.first;
    final msgController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: DiklyColors.surface,
        title: const Text('HOD Request', style: TextStyle(color: DiklyColors.text)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('To: ${hod.name}', style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
            const SizedBox(height: 12),
            TextField(
              controller: msgController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Message',
                labelStyle: TextStyle(color: DiklyColors.textSecondary),
                hintText: 'Type your request...',
                hintStyle: TextStyle(color: DiklyColors.textMuted),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: msgController.text.trim().isEmpty ? null : () async {
              Navigator.pop(ctx);
              try {
                final conv = await apiService.startConversation(hod.id, msgController.text.trim());
                await _loadConversations();
                if (mounted) _openConversation(conv);
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: DiklyColors.error),
                  );
                }
              }
            },
            child: const Text('Send Request'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_activeConversation != null) {
      return _buildChatScreen(_activeConversation!);
    }

    final user = ref.watch(currentUserProvider);
    final isStudent = user?.role == 'student';

    return AppShell(
      title: 'Messages',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: DiklyScreenHeader(
              title: 'Messages',
              subtitle: 'Your conversations',
              action: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (isStudent) ...[
                    ElevatedButton(
                      onPressed: _startHodRequest,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF59E0B),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        elevation: 0,
                        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                      child: const Text('HOD Request'),
                    ),
                    const SizedBox(width: 8),
                  ],
                  ElevatedButton.icon(
                    onPressed: _showNewMessageDialog,
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('New'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: DiklyColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      elevation: 0,
                      textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'Search conversations...',
                hintStyle: const TextStyle(fontSize: 13, color: DiklyColors.textMuted),
                prefixIcon: const Icon(Icons.search, size: 18, color: DiklyColors.textLight),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.primary, width: 1.5)),
              ),
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
                            'Unable to load messages. Pull down to refresh.',
                            style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(onPressed: _loadConversations, child: const Text('Retry')),
                        ],
                      ))
                    : _conversations.isEmpty
                        ? DiklyEmptyState(
                            icon: Icons.message_outlined,
                            title: 'No conversations yet',
                            subtitle: 'Click + New to start one',
                          )
                        : RefreshIndicator(
                            onRefresh: _loadConversations,
                            child: Builder(builder: (context) {
                              final filtered = _searchQuery.isEmpty
                                  ? _conversations
                                  : _conversations.where((c) => c.participantName.toLowerCase().contains(_searchQuery.toLowerCase())).toList();
                              return ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: filtered.length,
                              itemBuilder: (context, index) {
                                final conv = filtered[index];
                                return _ConversationTile(
                                  name: conv.participantName,
                                  lastMessage: conv.lastMessage ?? '',
                                  time: conv.lastMessageAt,
                                  unreadCount: conv.unreadCount,
                                  onTap: () => _openConversation(conv),
                                );
                              },
                            );
                            }),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _buildChatScreen(Conversation conv) {
    final currentUser = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(onPressed: () {
          setState(() {
            _activeConversation = null;
            _conversationMessages = [];
          });
          _loadConversations();
        }),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: DiklyColors.border, height: 1),
        ),
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundImage: conv.participantAvatar != null
                  ? NetworkImage(conv.participantAvatar!)
                  : null,
              backgroundColor: DiklyColors.primary.withOpacity(0.1),
              child: conv.participantAvatar == null
                  ? Text(
                      conv.participantName.isNotEmpty ? conv.participantName[0].toUpperCase() : 'U',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: DiklyColors.primary),
                    )
                  : null,
            ),
            const SizedBox(width: 10),
            Text(conv.participantName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: DiklyColors.text)),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messagesLoading
                ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
                : _conversationMessages.isEmpty
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
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: unreadCount > 0 ? FontWeight.w700 : FontWeight.w600,
                    color: DiklyColors.text,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  lastMessage.isEmpty ? 'No messages yet' : lastMessage,
                  style: TextStyle(
                    fontSize: 13,
                    color: unreadCount > 0 ? DiklyColors.text : DiklyColors.textSecondary,
                    fontWeight: unreadCount > 0 ? FontWeight.w500 : FontWeight.normal,
                  ),
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
                  _formatTime(time!),
                  style: const TextStyle(fontSize: 11, color: DiklyColors.textMuted),
                ),
              if (unreadCount > 0) ...[
                const SizedBox(height: 4),
                Container(
                  constraints: const BoxConstraints(minWidth: 20),
                  height: 20,
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  decoration: BoxDecoration(color: DiklyColors.primary, borderRadius: BorderRadius.circular(10)),
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

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);
    if (diff.inDays == 0) return DateFormat('h:mm a').format(time);
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return DateFormat('EEE').format(time);
    return DateFormat('d MMM').format(time);
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
              style: TextStyle(fontSize: 14, color: isMe ? Colors.white : DiklyColors.text),
            ),
            if (message.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                DateFormat('h:mm a').format(message.createdAt!),
                style: TextStyle(fontSize: 10, color: isMe ? Colors.white60 : DiklyColors.textMuted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
