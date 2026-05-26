import 'package:flutter/material.dart';
import '../../core/theme.dart';

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
    'Assignments',
    'Quizzes',
    'Account',
    'Technical',
  ];

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
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('FAQ & Help'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Page header
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'FAQ Center',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Ask questions, browse answers, get instant AI help',
                style: TextStyle(
                  fontSize: 13,
                  color: DiklyColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Ask a Question card
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ask a Question',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _askController,
                  decoration: const InputDecoration(
                    hintText: 'e.g. How do I mark attendance?',
                    prefixIcon: Icon(Icons.help_outline_rounded,
                        color: DiklyColors.textSecondary, size: 20),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _askAi,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      elevation: 0,
                    ),
                    icon: const Icon(Icons.auto_awesome_outlined, size: 16),
                    label: const Text(
                      'Ask AI',
                      style: TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Knowledge Base card
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Knowledge Base',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: DiklyColors.textPrimary,
                        ),
                      ),
                    ),
                    // Category dropdown
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        border: Border.all(color: DiklyColors.border),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedCategory,
                          icon: const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: DiklyColors.textSecondary,
                            size: 18,
                          ),
                          style: const TextStyle(
                            color: DiklyColors.textPrimary,
                            fontSize: 12,
                          ),
                          isDense: true,
                          items: _categories
                              .map(
                                (c) => DropdownMenuItem(
                                  value: c,
                                  child: Text(c),
                                ),
                              )
                              .toList(),
                          onChanged: (v) => setState(
                              () => _selectedCategory = v ?? 'All categories'),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // Empty state
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Icon(Icons.menu_book_outlined,
                          size: 40, color: DiklyColors.border),
                      SizedBox(height: 10),
                      Text(
                        'No FAQs found yet.',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Check back soon or ask the AI above.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // My Question History card
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'My Question History',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                SizedBox(height: 14),
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.history_rounded,
                          size: 36, color: DiklyColors.border),
                      SizedBox(height: 8),
                      Text(
                        'You have not asked any questions yet.',
                        style: TextStyle(
                          fontSize: 13,
                          color: DiklyColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
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

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: child,
    );
  }
}
