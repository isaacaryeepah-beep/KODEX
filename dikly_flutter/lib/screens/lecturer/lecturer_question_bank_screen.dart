import 'package:flutter/material.dart';
import '../../core/theme.dart';

class LecturerQuestionBankScreen extends StatefulWidget {
  const LecturerQuestionBankScreen({super.key});

  @override
  State<LecturerQuestionBankScreen> createState() =>
      _LecturerQuestionBankScreenState();
}

class _LecturerQuestionBankScreenState
    extends State<LecturerQuestionBankScreen> {
  final _searchController = TextEditingController();
  bool _selectAll = false;
  String _selectedTopic = 'All Topics';

  final List<String> _topics = ['All Topics', 'Mathematics', 'Science', 'History', 'English'];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Coming soon')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              'Question Bank',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            Text(
              'Save and reuse questions across quizzes — 0 total',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w400,
                color: DiklyColors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: _showComingSoon,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text(
                'Add Question',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Toolbar row: Select All + Search + Topic filter
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    // Select all checkbox
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Checkbox(
                          value: _selectAll,
                          onChanged: (v) =>
                              setState(() => _selectAll = v ?? false),
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        ),
                        const Text(
                          'Select All',
                          style: TextStyle(
                              fontSize: 13, color: DiklyColors.textSecondary),
                        ),
                      ],
                    ),
                    const SizedBox(width: 10),
                    // Search field
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        decoration: const InputDecoration(
                          hintText: 'Search questions...',
                          prefixIcon: Icon(Icons.search_rounded,
                              color: DiklyColors.textSecondary, size: 18),
                          contentPadding: EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // Topic dropdown
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: DiklyColors.border),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _selectedTopic,
                      isExpanded: true,
                      icon: const Icon(Icons.keyboard_arrow_down_rounded,
                          color: DiklyColors.textSecondary),
                      style: const TextStyle(
                          color: DiklyColors.textPrimary, fontSize: 13),
                      items: _topics
                          .map((t) => DropdownMenuItem(
                                value: t,
                                child: Text(t),
                              ))
                          .toList(),
                      onChanged: (v) =>
                          setState(() => _selectedTopic = v ?? 'All Topics'),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          // Empty state
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEEF2FF),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.help_outline_rounded,
                    size: 36,
                    color: Color(0xFF3F51B5),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'No questions yet.',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: DiklyColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Add your first question or save questions from a quiz.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: DiklyColors.textSecondary,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _showComingSoon,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text(
                    '+ Add Question',
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
