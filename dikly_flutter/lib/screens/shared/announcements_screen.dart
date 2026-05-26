import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/announcement.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/ds/dikly_ds.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  List<Announcement> _announcements = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final announcements = await apiService.getAnnouncements();
      setState(() {
        _announcements = announcements;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _showPostSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PostAnnouncementSheet(
        onPosted: () {
          Navigator.of(context).pop();
          _loadData();
        },
      ),
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
        title: const Text('Announcements'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton.icon(
              onPressed: _showPostSheet,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Post', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showPostSheet,
        backgroundColor: const Color(0xFF2563EB),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.campaign_outlined),
        label: const Text('Post Announcement', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const LoadingList()
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                      const SizedBox(height: 12),
                      Text(_error!),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                    ],
                  ),
                )
              : _announcements.isEmpty
                  ? const EmptyState(
                      icon: Icons.campaign_outlined,
                      title: 'No announcements',
                      message: 'Announcements will appear here',
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                        itemCount: _announcements.length,
                        itemBuilder: (ctx, i) => _AnnouncementCard(announcement: _announcements[i]),
                      ),
                    ),
    );
  }
}

// ---------- Post Announcement Sheet ----------

class _PostAnnouncementSheet extends StatefulWidget {
  final VoidCallback onPosted;
  const _PostAnnouncementSheet({required this.onPosted});

  @override
  State<_PostAnnouncementSheet> createState() => _PostAnnouncementSheetState();
}

class _PostAnnouncementSheetState extends State<_PostAnnouncementSheet> {
  final _titleCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  String _type = 'Info';
  String _targetCourse = '— All my students —';
  DateTime? _expiresAt;
  bool _posting = false;

  final List<String> _types = ['Info', 'Warning', 'Urgent'];
  final List<String> _courses = ['— All my students —'];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _expiresAt = picked);
    }
  }

  Future<void> _post() async {
    if (_titleCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a title')),
      );
      return;
    }
    if (_messageCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a message')),
      );
      return;
    }
    setState(() => _posting = true);
    try {
      await apiService.createAnnouncement({
        'title': _titleCtrl.text.trim(),
        'content': _messageCtrl.text.trim(),
        'type': _type.toLowerCase(),
        'audience': 'students',
        if (_expiresAt != null) 'expiresAt': _expiresAt!.toIso8601String(),
      });
      widget.onPosted();
    } catch (e) {
      setState(() => _posting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: ${e.toString()}')),
        );
      }
    }
  }

  InputDecoration _fieldDeco({String? hint, int? maxLines, Widget? suffixIcon}) {
    return InputDecoration(
      hintText: hint,
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: Colors.white,
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
      hintStyle: const TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM d, yyyy');

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE5E7EB),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Header row
            Row(
              children: [
                const Text(
                  '📢 Post Announcement',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
                ),
                const Spacer(),
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Color(0xFF6B7280), size: 20),
                    padding: const EdgeInsets.all(6),
                    constraints: const BoxConstraints(),
                  ),
                ),
              ],
            ),
            const Divider(height: 20, color: Color(0xFFE5E7EB)),
            const SizedBox(height: 4),

            // TITLE
            const DiklySectionLabel('TITLE *'),
            TextField(
              controller: _titleCtrl,
              decoration: _fieldDeco(hint: 'e.g. Class cancelled tomorrow'),
            ),
            const SizedBox(height: 14),

            // MESSAGE
            const DiklySectionLabel('MESSAGE *'),
            TextField(
              controller: _messageCtrl,
              maxLines: 4,
              decoration: _fieldDeco(hint: 'Enter your announcement...'),
            ),
            const SizedBox(height: 14),

            // TYPE
            const DiklySectionLabel('TYPE'),
            DropdownButtonFormField<String>(
              value: _type,
              decoration: InputDecoration(
                filled: true,
                fillColor: Colors.white,
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
              items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 14)))).toList(),
              onChanged: (v) => setState(() => _type = v ?? 'Info'),
            ),
            const SizedBox(height: 14),

            // AUDIENCE
            const DiklySectionLabel('AUDIENCE'),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE5E7EB)),
              ),
              child: const Row(
                children: [
                  Text('📚 My Students only', style: TextStyle(fontSize: 14, color: Color(0xFF374151))),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // TARGET COURSE
            const DiklySectionLabel('TARGET COURSE (optional)'),
            DropdownButtonFormField<String>(
              value: _targetCourse,
              decoration: InputDecoration(
                filled: true,
                fillColor: Colors.white,
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
              items: _courses.map((c) => DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 14)))).toList(),
              onChanged: (v) => setState(() => _targetCourse = v ?? '— All my students —'),
            ),
            const SizedBox(height: 4),
            const Text(
              'Pick a course to target only that group. Leave blank to reach all your students.',
              style: TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 14),

            // EXPIRES AT
            const DiklySectionLabel('EXPIRES AT (optional)'),
            GestureDetector(
              onTap: _pickExpiry,
              child: AbsorbPointer(
                child: TextField(
                  readOnly: true,
                  controller: TextEditingController(
                    text: _expiresAt != null ? fmt.format(_expiresAt!) : '',
                  ),
                  decoration: _fieldDeco(
                    hint: 'No expiry date',
                    suffixIcon: const Icon(Icons.calendar_today_outlined, color: Color(0xFF9CA3AF), size: 18),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // ATTACHMENT
            const DiklySectionLabel('ATTACHMENT (PDF or image, optional)'),
            GestureDetector(
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('File upload coming soon')),
              ),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.attach_file, size: 16, color: Color(0xFF6B7280)),
                    SizedBox(width: 6),
                    Text('📎 Attach File', style: TextStyle(fontSize: 13, color: Color(0xFF6B7280))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF6B7280),
                      side: const BorderSide(color: Color(0xFFE5E7EB)),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DiklyPrimaryButton(
                    label: '📢 Post',
                    loading: _posting,
                    onPressed: _post,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

// ---------- Announcement Card ----------

class _AnnouncementCard extends StatefulWidget {
  final Announcement announcement;
  const _AnnouncementCard({required this.announcement});

  @override
  State<_AnnouncementCard> createState() => _AnnouncementCardState();
}

class _AnnouncementCardState extends State<_AnnouncementCard> {
  bool _expanded = false;

  Color get _priorityColor {
    if (widget.announcement.isUrgent) return DiklyColors.error;
    return DiklyColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.announcement;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: a.isUrgent ? DiklyColors.error.withOpacity(0.3) : DiklyColors.border,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: _priorityColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        a.isUrgent ? Icons.priority_high_rounded : Icons.campaign_rounded,
                        color: _priorityColor,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.title,
                            style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          if (a.authorName != null)
                            Text(
                              'By ${a.authorName}',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary),
                            ),
                        ],
                      ),
                    ),
                    if (a.isUrgent)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: DiklyColors.error.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'URGENT',
                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: DiklyColors.error),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  a.content,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: DiklyColors.textSecondary, height: 1.5),
                  maxLines: _expanded ? null : 3,
                  overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                ),
                if (a.content.length > 150) ...[
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Text(
                      _expanded ? 'Show less' : 'Read more',
                      style: const TextStyle(color: DiklyColors.primary, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (a.createdAt != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(
                color: Color(0xFFF1F5F9),
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.access_time_rounded, size: 13, color: DiklyColors.textSecondary),
                  const SizedBox(width: 4),
                  Text(
                    DateFormat('MMM d, yyyy').format(a.createdAt!),
                    style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary),
                  ),
                  if (a.targetRole != null) ...[
                    const SizedBox(width: 12),
                    const Icon(Icons.people_outline_rounded, size: 13, color: DiklyColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      a.targetRole!.toUpperCase(),
                      style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary, fontWeight: FontWeight.w500),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
