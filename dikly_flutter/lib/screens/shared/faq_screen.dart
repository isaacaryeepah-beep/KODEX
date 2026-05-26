import 'package:flutter/material.dart';
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
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
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
            subtitle: 'Ask questions, browse answers, get instant AI help',
          ),

          // Ask a Question card
          DiklyCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Ask a Question', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _askController,
                        decoration: InputDecoration(
                          hintText: 'e.g. How do I mark attendance?',
                          filled: true,
                          fillColor: const Color(0xFFF9FAFB),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF2563EB), width: 2),
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _askAi,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
          const SizedBox(height: 12),

          // Knowledge Base card
          DiklyCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text('Knowledge Base', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    ),
                    OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF2563EB),
                        side: const BorderSide(color: Color(0xFFBFDBFE)),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedCategory,
                          icon: const Icon(Icons.expand_more, size: 16, color: Color(0xFF2563EB)),
                          style: const TextStyle(color: Color(0xFF2563EB), fontSize: 12),
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
                const Center(
                  child: Text(
                    'No FAQs found yet. Check back soon or ask the AI above.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // My Question History card
          DiklyCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text('My Question History', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                SizedBox(height: 12),
                Text('You have not asked any questions yet.', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
