import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme.dart';

// ── Static knowledge base ────────────────────────────────────────────────────

class _FaqItem {
  final String question;
  final String answer;
  final String category;
  const _FaqItem({required this.question, required this.answer, required this.category});
}

const _allFaqs = [
  _FaqItem(
    category: 'Getting Started',
    question: 'How do I mark attendance?',
    answer: 'Go to the Attendance section from the home screen. Your lecturer will share a session code or QR code. Enter the code or scan it to mark yourself present within the allowed time window.',
  ),
  _FaqItem(
    category: 'Getting Started',
    question: 'How do I join a session?',
    answer: 'Navigate to Sessions or Meetings. Find the active session and tap "Join". For online meetings you will be redirected to the meeting platform; for in-person sessions attendance is tracked via code.',
  ),
  _FaqItem(
    category: 'Getting Started',
    question: 'How do I submit an assignment?',
    answer: 'Open Assignments, find the relevant task, and tap it to view details. Use the "Submit" button to upload your work before the deadline.',
  ),
  _FaqItem(
    category: 'Account & Security',
    question: 'How do I change my password?',
    answer: 'Go to your Profile screen and tap "Change Password". Enter your current password followed by your new password twice. Passwords must be at least 8 characters long.',
  ),
  _FaqItem(
    category: 'Account & Security',
    question: 'What is 2FA?',
    answer: 'Two-Factor Authentication adds an extra security layer. After entering your password you will be asked for a one-time code sent to your registered email or phone number.',
  ),
  _FaqItem(
    category: 'Account & Security',
    question: 'How do I update my profile?',
    answer: 'Open your Profile screen and tap "Edit Profile". You can update your name, phone number, profile photo, and other details. Tap "Save" when done.',
  ),
  _FaqItem(
    category: 'Technical Support',
    question: 'The app is not loading, what should I do?',
    answer: 'First check your internet connection. If the issue persists, try force-closing the app and reopening it. You can also clear the app cache in your device settings.',
  ),
  _FaqItem(
    category: 'Technical Support',
    question: 'I cannot log in, what should I do?',
    answer: 'Make sure you are using the correct email and password. If you have forgotten your password, use the "Forgot Password" link on the login screen.',
  ),
];

const _allCategories = ['All categories', 'Getting Started', 'Account & Security', 'Technical Support'];

// ── Question history provider ────────────────────────────────────────────────

final _questionHistoryProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) async => [],
);

// ── Screen ───────────────────────────────────────────────────────────────────

class FaqScreen extends ConsumerStatefulWidget {
  const FaqScreen({super.key});

  @override
  ConsumerState<FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends ConsumerState<FaqScreen> {
  final _aiController = TextEditingController();
  String _selectedCategory = 'All categories';
  String _searchQuery = '';
  bool _askingAI = false;
  String? _aiAnswer;

  @override
  void dispose() {
    _aiController.dispose();
    super.dispose();
  }

  List<_FaqItem> get _filtered {
    return _allFaqs.where((f) {
      final catMatch = _selectedCategory == 'All categories' || f.category == _selectedCategory;
      final searchMatch = _searchQuery.isEmpty ||
          f.question.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          f.answer.toLowerCase().contains(_searchQuery.toLowerCase());
      return catMatch && searchMatch;
    }).toList();
  }

  Future<void> _askAI() async {
    final q = _aiController.text.trim();
    if (q.isEmpty) return;
    setState(() { _askingAI = true; _aiAnswer = null; });
    await Future.delayed(const Duration(milliseconds: 600));
    setState(() {
      _askingAI = false;
      _aiAnswer = 'For personalised support, please contact your institution\'s help desk or email support@dikly.sbs.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(_questionHistoryProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('FAQ & Help'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          const SizedBox(height: 16),

          // ── Header ──────────────────────────────────────────────────────
          const Text(
            'FAQ Center',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 4),
          const Text(
            'Ask questions, browse answers, get instant AI help',
            style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
          ),

          const SizedBox(height: 20),

          // ── Ask a Question card ─────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Ask a Question',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _aiController,
                        decoration: const InputDecoration(
                          hintText: 'e.g. How do I mark attendance?',
                          hintStyle: TextStyle(fontSize: 13, color: Color(0xFF9CA3AF)),
                          contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.all(Radius.circular(8)),
                            borderSide: BorderSide(color: Color(0xFFE5E7EB)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.all(Radius.circular(8)),
                            borderSide: BorderSide(color: Color(0xFFE5E7EB)),
                          ),
                        ),
                        onSubmitted: (_) => _askAI(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _askingAI ? null : _askAI,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: DiklyColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: _askingAI
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Ask AI', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                if (_aiAnswer != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFBFDBFE)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.auto_awesome_rounded, size: 18, color: DiklyColors.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_aiAnswer!, style: const TextStyle(fontSize: 13, color: Color(0xFF1E40AF), height: 1.5)),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 16),

          // ── Knowledge Base card ─────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Text('Knowledge Base',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const Spacer(),
                    // Category filter
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFFE5E7EB)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedCategory,
                          isDense: true,
                          style: const TextStyle(fontSize: 12, color: DiklyColors.primary, fontWeight: FontWeight.w600),
                          icon: const Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: DiklyColors.primary),
                          items: _allCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                          onChanged: (v) { if (v != null) setState(() => _selectedCategory = v); },
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Search
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Search questions...',
                    prefixIcon: Icon(Icons.search_rounded, size: 18),
                    contentPadding: EdgeInsets.symmetric(vertical: 8),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(8)),
                      borderSide: BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(8)),
                      borderSide: BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                ),
                const SizedBox(height: 12),

                if (_filtered.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No FAQs found yet. Check back soon or ask the AI above.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13),
                      ),
                    ),
                  )
                else
                  ..._filtered.map((faq) => _FaqTile(faq: faq)),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // ── My Question History card ────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('My Question History',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                const SizedBox(height: 12),
                history.when(
                  loading: () => const Center(child: Padding(
                    padding: EdgeInsets.all(16),
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )),
                  error: (_, __) => const Text('You have not asked any questions yet.',
                      style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13)),
                  data: (items) => items.isEmpty
                      ? const Text('You have not asked any questions yet.',
                          style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13))
                      : Column(
                          children: items.map((item) => _HistoryTile(item: item)).toList(),
                        ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ── Contact Support button ──────────────────────────────────────
          OutlinedButton.icon(
            onPressed: () async {
              final uri = Uri.parse('mailto:support@dikly.sbs');
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            },
            icon: const Icon(Icons.email_outlined, size: 18),
            label: const Text('Contact Support'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }
}

class _FaqTile extends StatelessWidget {
  final _FaqItem faq;
  const _FaqTile({required this.faq});

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: 12),
      title: Text(faq.question,
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF111827))),
      children: [
        Text(faq.answer,
            style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280), height: 1.55)),
      ],
    );
  }
}

class _HistoryTile extends StatelessWidget {
  final Map<String, dynamic> item;
  const _HistoryTile({required this.item});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.history_rounded, size: 16, color: Color(0xFF9CA3AF)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              item['question']?.toString() ?? '',
              style: const TextStyle(fontSize: 13, color: Color(0xFF374151)),
            ),
          ),
        ],
      ),
    );
  }
}
