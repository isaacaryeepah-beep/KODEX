import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme.dart';

class _FaqItem {
  final String question;
  final String answer;
  const _FaqItem({required this.question, required this.answer});
}

class _FaqCategory {
  final String title;
  final IconData icon;
  final List<_FaqItem> items;
  const _FaqCategory({
    required this.title,
    required this.icon,
    required this.items,
  });
}

const _categories = [
  _FaqCategory(
    title: 'Getting Started',
    icon: Icons.play_circle_outline_rounded,
    items: [
      _FaqItem(
        question: 'How do I mark attendance?',
        answer:
            'Go to the Attendance section from the home screen. Your lecturer will share a session code or QR code. Enter the code or scan it to mark yourself present. Make sure you are within the allowed time window for the session.',
      ),
      _FaqItem(
        question: 'How do I join a session?',
        answer:
            'Navigate to the Sessions or Meetings screen. Find the active session and tap "Join". If it is an online meeting, you will be redirected to the meeting platform. For in-person sessions, your attendance will be tracked via code.',
      ),
      _FaqItem(
        question: 'How do I submit an assignment?',
        answer:
            'Open the Assignments screen, find the relevant assignment, and tap on it to view details. Use the "Submit" button to upload your work before the deadline. You can attach files or enter text depending on the assignment type.',
      ),
    ],
  ),
  _FaqCategory(
    title: 'Account & Security',
    icon: Icons.shield_outlined,
    items: [
      _FaqItem(
        question: 'How do I change my password?',
        answer:
            'Go to your Profile screen and tap "Change Password" under the Settings section. You will need to enter your current password followed by your new password twice to confirm. Passwords must be at least 8 characters long.',
      ),
      _FaqItem(
        question: 'What is 2FA?',
        answer:
            'Two-Factor Authentication (2FA) adds an extra layer of security to your account. After entering your password, you will be asked for a one-time code sent to your registered email or phone number. This helps prevent unauthorised access even if your password is compromised.',
      ),
      _FaqItem(
        question: 'How do I update my profile?',
        answer:
            'Tap your avatar or name at the top of the home screen to open your Profile. You can update your display name, phone number, and profile picture. Some fields like email and role can only be changed by an administrator.',
      ),
    ],
  ),
  _FaqCategory(
    title: 'Technical',
    icon: Icons.build_outlined,
    items: [
      _FaqItem(
        question: 'What if I cannot connect?',
        answer:
            'First check your internet connection — switch between Wi-Fi and mobile data to see if the issue is network-specific. If the app still cannot connect, the server may be temporarily unavailable. Try again after a few minutes. If the problem persists, contact support at support@dikly.sbs.',
      ),
      _FaqItem(
        question: 'Which devices are supported?',
        answer:
            'DIKLY is available on Android (version 8.0 and above) and iOS (version 14 and above). For the best experience, keep your device operating system and the DIKLY app updated to the latest version.',
      ),
      _FaqItem(
        question: 'How do I report a bug?',
        answer:
            'Use the "Contact Support" button at the bottom of this screen to email our support team. Please include a description of what you were doing, what went wrong, your device model, and the app version. Screenshots are always helpful.',
      ),
    ],
  ),
];

class FaqScreen extends StatefulWidget {
  const FaqScreen({super.key});

  @override
  State<FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends State<FaqScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _query = _searchController.text.trim().toLowerCase());
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _contactSupport() async {
    final uri = Uri.parse('mailto:support@dikly.sbs');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  List<_FaqCategory> get _filteredCategories {
    if (_query.isEmpty) return _categories;
    final result = <_FaqCategory>[];
    for (final cat in _categories) {
      final matchedItems = cat.items.where((item) {
        return item.question.toLowerCase().contains(_query) ||
            item.answer.toLowerCase().contains(_query);
      }).toList();
      if (matchedItems.isNotEmpty) {
        result.add(_FaqCategory(
          title: cat.title,
          icon: cat.icon,
          items: matchedItems,
        ));
      }
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filtered = _filteredCategories;

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('FAQ & Help'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search questions...',
                prefixIcon: const Icon(Icons.search_rounded,
                    color: DiklyColors.textSecondary),
                suffixIcon: _query.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded,
                            color: DiklyColors.textSecondary),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                      )
                    : null,
              ),
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.search_off_rounded,
                            size: 56, color: DiklyColors.textSecondary),
                        const SizedBox(height: 16),
                        Text(
                          'No results for "$_query"',
                          style: theme.textTheme.bodyLarge?.copyWith(
                              color: DiklyColors.textSecondary),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding:
                        const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      return _CategorySection(
                        category: filtered[index],
                        searchQuery: _query,
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _contactSupport,
                icon: const Icon(Icons.email_outlined),
                label: const Text('Contact Support'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CategorySection extends StatelessWidget {
  final _FaqCategory category;
  final String searchQuery;

  const _CategorySection({
    required this.category,
    required this.searchQuery,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: ExpansionTile(
        leading: Icon(category.icon,
            color: DiklyColors.primary, size: 22),
        title: Text(
          category.title,
          style: theme.textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w600),
        ),
        initiallyExpanded: searchQuery.isNotEmpty,
        childrenPadding: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        collapsedShape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        children: List.generate(category.items.length, (i) {
          final item = category.items[i];
          return Column(
            children: [
              const Divider(height: 1, indent: 16, endIndent: 16),
              ListTile(
                contentPadding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                title: Text(
                  item.question,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    item.answer,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: DiklyColors.textSecondary, height: 1.5),
                  ),
                ),
                isThreeLine: true,
              ),
            ],
          );
        }),
      ),
    );
  }
}
