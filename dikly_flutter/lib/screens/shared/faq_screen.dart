import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class FaqScreen extends StatefulWidget {
  const FaqScreen({super.key});

  @override
  State<FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends State<FaqScreen> {
  final _askController = TextEditingController();
  String _selectedCategory = 'All categories';

  final List<String> _categories = [
    'All categories',
    'Attendance',
    'Leave',
    'Shifts',
    'Account',
    'Technical',
  ];

  // Sample FAQ data — expandable
  final List<Map<String, String>> _faqs = [
    {
      'question': 'How do I clock in / out?',
      'answer': 'Navigate to the Dashboard and tap the "Clock In" or "Clock Out" button. Make sure location permissions are enabled.',
      'category': 'Attendance',
    },
    {
      'question': 'How do I request leave?',
      'answer': 'Go to My Leaves, tap "Request Leave", fill in the type, date range, and reason, then submit. Your manager will review the request.',
      'category': 'Leave',
    },
    {
      'question': 'How do I view my shift schedule?',
      'answer': 'Go to My Shift from the drawer menu. You will see your shift name, start/end times, location, and a weekly calendar view.',
      'category': 'Shifts',
    },
    {
      'question': 'How do I change my password?',
      'answer': 'Go to My Profile, scroll to the "Change Password" section, enter your current password and your new password, then tap Save.',
      'category': 'Account',
    },
  ];

  List<Map<String, String>> get _filteredFaqs => _selectedCategory == 'All categories'
      ? _faqs
      : _faqs.where((f) => f['category'] == _selectedCategory).toList();

  @override
  void dispose() {
    _askController.dispose();
    super.dispose();
  }

  void _askAi() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('AI answer coming soon')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('FAQ Center'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'FAQ Center',
            subtitle: 'Knowledge Base',
          ),

          // Ask a Question card
          DiklyCard(
            margin: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ask a Question',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _askController,
                        decoration: InputDecoration(
                          hintText: 'e.g. How do I mark attendance?',
                          filled: true,
                          fillColor: DiklyColors.background,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: DiklyColors.border),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: DiklyColors.border),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: DiklyColors.primary, width: 2),
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          hintStyle: const TextStyle(color: DiklyColors.textMuted, fontSize: 14),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _askAi,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: DiklyColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          elevation: 0,
                        ),
                        child: const Text('Ask AI', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Knowledge Base card
          DiklyCard(
            margin: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Knowledge Base',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                      ),
                    ),
                    // Category filter dropdown
                    OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(
                        foregroundColor: DiklyColors.primary,
                        side: const BorderSide(color: Color(0xFFBFDBFE)),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedCategory,
                          icon: const Icon(Icons.expand_more, size: 16, color: DiklyColors.primary),
                          style: const TextStyle(color: DiklyColors.primary, fontSize: 12),
                          isDense: true,
                          items: _categories
                              .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                              .toList(),
                          onChanged: (v) => setState(() => _selectedCategory = v ?? 'All categories'),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (_filteredFaqs.isEmpty)
                  const Center(
                    child: Text(
                      'No FAQs in this category yet.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                    ),
                  )
                else
                  Column(
                    children: _filteredFaqs
                        .map((faq) => _FaqItem(
                              question: faq['question']!,
                              answer: faq['answer']!,
                              category: faq['category']!,
                            ))
                        .toList(),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _FaqItem extends StatefulWidget {
  final String question;
  final String answer;
  final String category;

  const _FaqItem({
    required this.question,
    required this.answer,
    required this.category,
  });

  @override
  State<_FaqItem> createState() => _FaqItemState();
}

class _FaqItemState extends State<_FaqItem> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: DiklyColors.background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      widget.question,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 18,
                    color: DiklyColors.textSecondary,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Divider(height: 1),
                  const SizedBox(height: 10),
                  Text(
                    widget.answer,
                    style: const TextStyle(
                      fontSize: 13,
                      color: DiklyColors.textSecondary,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Category chip
                  DiklyBadge(
                    label: widget.category,
                    color: DiklyColors.primary,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
