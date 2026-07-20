import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

/// Dikly AI chat — parity with the web's ai-reports page.
///
/// Free-text questions go to the tool-enabled endpoint first
/// (POST /api/ai-actions/chat), which can read live institution data and
/// may return a `pendingAction`: a prepared change (unlock a student,
/// approve a leave, extend a session) that only the user's Confirm tap
/// executes. If that endpoint is unavailable, the classic ai-reports
/// custom_query answer is used instead — same fallback as the web.
class DiklyAiScreen extends StatefulWidget {
  const DiklyAiScreen({super.key});

  @override
  State<DiklyAiScreen> createState() => _DiklyAiScreenState();
}

class _ChatMessage {
  _ChatMessage({
    required this.role, // 'user' | 'assistant'
    required this.text,
    this.usedTools = false,
    this.pendingSummary,
    this.pendingToken,
    this.actionResult, // 'done: …' | 'failed: …' | 'cancelled'
  });

  final String role;
  final String text;
  final bool usedTools;
  final String? pendingSummary;
  String? pendingToken;
  String? actionResult;
}

class _DiklyAiScreenState extends State<DiklyAiScreen> {
  final List<_ChatMessage> _messages = [];
  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  List<Map<String, String>> _historyPayload() {
    final turns = _messages
        .where((m) => m.text.isNotEmpty)
        .map((m) => {'role': m.role, 'text': m.text})
        .toList();
    return turns.length > 8 ? turns.sublist(turns.length - 8) : turns;
  }

  Future<void> _send() async {
    final q = _input.text.trim();
    if (q.isEmpty || _sending) return;
    final history = _historyPayload();
    setState(() {
      _messages.add(_ChatMessage(role: 'user', text: q));
      _sending = true;
      _input.clear();
    });
    _scrollToBottom();

    try {
      final d = await apiService.aiActionChat(q, history);
      final pending = d['pendingAction'];
      setState(() {
        _messages.add(_ChatMessage(
          role: 'assistant',
          text: (d['reply'] ?? 'No answer was returned.').toString(),
          usedTools: (d['toolsUsed'] as List?)?.isNotEmpty ?? false,
          pendingSummary: pending is Map ? pending['summary']?.toString() : null,
          pendingToken: pending is Map ? pending['token']?.toString() : null,
        ));
      });
    } catch (_) {
      // Tool endpoint unavailable → classic answer path, same as the web.
      try {
        final answer = await apiService.aiReportAsk(q);
        setState(() {
          _messages.add(_ChatMessage(role: 'assistant', text: answer));
        });
      } catch (e2) {
        setState(() {
          _messages.add(_ChatMessage(
            role: 'assistant',
            text: "Sorry — I couldn't answer that right now. Please try again.",
          ));
        });
      }
    } finally {
      setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  Future<void> _confirmAction(_ChatMessage m) async {
    final token = m.pendingToken;
    if (token == null) return;
    setState(() => m.pendingToken = null);
    try {
      final d = await apiService.aiActionExecute(token);
      setState(() => m.actionResult = 'done: ${d['message'] ?? 'Done.'}');
    } catch (e) {
      setState(() => m.actionResult = 'failed: The action could not be completed.');
    }
    _scrollToBottom();
  }

  void _cancelAction(_ChatMessage m) {
    setState(() {
      m.pendingToken = null;
      m.actionResult = 'cancelled';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Color(0xFFFDE68A), Color(0xFFF9A8D4), Color(0xFFA78BFA), Color(0xFF7C3AED)],
                ),
              ),
            ),
            const SizedBox(width: 10),
            const Text('Dikly AI'),
          ],
        ),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        actions: [
          IconButton(
            tooltip: 'New chat',
            icon: const Icon(Icons.add_comment_outlined),
            onPressed: () => setState(_messages.clear),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty ? _emptyState() : _thread(),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _emptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Color(0xFFFDE68A), Color(0xFFF9A8D4), Color(0xFFA78BFA), Color(0xFF7C3AED)],
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Ask Dikly AI anything',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
            ),
            const SizedBox(height: 6),
            const Text(
              'It can check your live data — try "who is locked out?", '
              '"how\'s attendance today?" or "any leave requests waiting?"',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _thread() {
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 8),
      itemCount: _messages.length + (_sending ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == _messages.length) return _typingBubble();
        final m = _messages[i];
        return m.role == 'user' ? _userBubble(m) : _assistantBubble(m);
      },
    );
  }

  Widget _typingBubble() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 10),
          Text('Thinking…', style: TextStyle(color: Color(0xFF6B7280), fontSize: 13)),
        ],
      ),
    );
  }

  Widget _userBubble(_ChatMessage m) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14, left: 48),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF4F6EF7), Color(0xFF7C3AED)]),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(16),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
            bottomRight: Radius.circular(4),
          ),
        ),
        child: Text(m.text, style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.45)),
      ),
    );
  }

  Widget _assistantBubble(_ChatMessage m) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16, right: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(m.text, style: const TextStyle(fontSize: 14, height: 1.6, color: Color(0xFF111827))),
          if (m.usedTools)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                border: Border.all(color: DiklyColors.border),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('🔍 Checked live data',
                  style: TextStyle(fontSize: 11, color: Color(0xFF6B7280), fontWeight: FontWeight.w600)),
            ),
          if (m.pendingToken != null && m.pendingSummary != null) _confirmCard(m),
          if (m.actionResult != null) _actionResultNote(m),
        ],
      ),
    );
  }

  Widget _confirmCard(_ChatMessage m) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF4F6EF7).withValues(alpha: 0.05),
        border: Border.all(color: const Color(0xFF4F6EF7), width: 1.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('⚡ ${m.pendingSummary}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
          const SizedBox(height: 10),
          Row(
            children: [
              ElevatedButton(
                onPressed: () => _confirmAction(m),
                style: ElevatedButton.styleFrom(
                  backgroundColor: DiklyColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                ),
                child: const Text('Confirm'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => _cancelAction(m),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _actionResultNote(_ChatMessage m) {
    final r = m.actionResult!;
    final done = r.startsWith('done:');
    final cancelled = r == 'cancelled';
    final text = cancelled
        ? 'Action cancelled — nothing was changed.'
        : r.substring(r.indexOf(':') + 1).trim();
    final color = cancelled
        ? const Color(0xFF6B7280)
        : done
            ? const Color(0xFF16A34A)
            : const Color(0xFFEF4444);
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.5)),
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        cancelled ? text : (done ? '✅ $text' : '❌ $text'),
        style: TextStyle(fontSize: 13, color: cancelled ? color : const Color(0xFF111827)),
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          border: Border(top: BorderSide(color: DiklyColors.border)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: InputDecoration(
                  hintText: 'Ask about your institution…',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                    borderSide: BorderSide(color: DiklyColors.border),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _sending ? null : _send,
              style: IconButton.styleFrom(backgroundColor: DiklyColors.primary),
              icon: const Icon(Icons.arrow_upward_rounded, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}
