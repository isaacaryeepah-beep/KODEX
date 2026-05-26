import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/announcement.dart';
import '../../widgets/loading_list.dart';
import '../../widgets/empty_state.dart';

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
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
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
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              icon: const Icon(Icons.add, size: 16),
              label: const Text(
                'Post',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showPostSheet,
        backgroundColor: const Color(0xFF2563EB),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.campaign_outlined),
        label: const Text(
          'Post Announcement',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: _loading
          ? const LoadingList()
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline,
                          color: DiklyColors.error, size: 48),
                      const SizedBox(height: 12),
                      Text(_error!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                          onPressed: _loadData,
                          child: const Text('Retry')),
                    ],
                  ),
                )
              : _announcements.isEmpty
                  ? const EmptyState(
                      icon: Icons.campaign_outlined,
                      title: 'No announcements',
                      message: 'Announcements will appear here')
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                        itemCount: _announcements.length,
                        itemBuilder: (ctx, i) =>
                            _AnnouncementCard(announcement: _announcements[i]),
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
  State<_PostAnnouncementSheet> createState() =>
      _PostAnnouncementSheetState();
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
        if (_expiresAt != null)
          'expiresAt': _expiresAt!.toIso8601String(),
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

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM d, yyyy');

    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: SingleChildScrollView(
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
                    color: DiklyColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Header row
              Row(
                children: [
                  const Text(
                    '📢  Post Announcement',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: DiklyColors.textPrimary,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded,
                        color: DiklyColors.textSecondary),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // TITLE
              _FieldLabel('TITLE *'),
              const SizedBox(height: 6),
              TextField(
                controller: _titleCtrl,
                decoration: const InputDecoration(
                  hintText: 'e.g. Class cancelled tomorrow',
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
              const SizedBox(height: 14),

              // MESSAGE
              _FieldLabel('MESSAGE *'),
              const SizedBox(height: 6),
              TextField(
                controller: _messageCtrl,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'Enter your announcement...',
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
              const SizedBox(height: 14),

              // TYPE
              _FieldLabel('TYPE'),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: DiklyColors.border),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _type,
                    isExpanded: true,
                    items: _types
                        .map((t) => DropdownMenuItem(
                              value: t,
                              child: Text(t,
                                  style: const TextStyle(fontSize: 14)),
                            ))
                        .toList(),
                    onChanged: (v) =>
                        setState(() => _type = v ?? 'Info'),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // AUDIENCE — read-only
              _FieldLabel('AUDIENCE'),
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 13),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  border: Border.all(color: DiklyColors.border),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  'My Students only',
                  style: TextStyle(
                    fontSize: 14,
                    color: DiklyColors.textSecondary,
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // TARGET COURSE
              _FieldLabel('TARGET COURSE (optional)'),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: DiklyColors.border),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _targetCourse,
                    isExpanded: true,
                    items: _courses
                        .map((c) => DropdownMenuItem(
                              value: c,
                              child: Text(c,
                                  style: const TextStyle(fontSize: 14)),
                            ))
                        .toList(),
                    onChanged: (v) =>
                        setState(() => _targetCourse = v ?? '— All my students —'),
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // EXPIRES AT
              _FieldLabel('EXPIRES AT (optional)'),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: _pickExpiry,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 13),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: DiklyColors.border),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined,
                          size: 16, color: DiklyColors.textSecondary),
                      const SizedBox(width: 10),
                      Text(
                        _expiresAt != null
                            ? fmt.format(_expiresAt!)
                            : 'No expiry date',
                        style: TextStyle(
                          fontSize: 14,
                          color: _expiresAt != null
                              ? DiklyColors.textPrimary
                              : DiklyColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // ATTACHMENT
              _FieldLabel('ATTACHMENT (PDF or image, optional)'),
              const SizedBox(height: 6),
              OutlinedButton.icon(
                onPressed: () {},
                style: OutlinedButton.styleFrom(
                  foregroundColor: DiklyColors.textSecondary,
                  side: const BorderSide(color: DiklyColors.border),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Text('📎', style: TextStyle(fontSize: 16)),
                label: const Text('Attach File'),
              ),
              const SizedBox(height: 24),

              // Action buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: DiklyColors.textSecondary,
                        side: const BorderSide(color: DiklyColors.border),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _posting ? null : _post,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2563EB),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      child: _posting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              '📢  Post',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600),
                            ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String label;
  const _FieldLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: DiklyColors.textSecondary,
        letterSpacing: 0.8,
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
            color: a.isUrgent
                ? DiklyColors.error.withOpacity(0.3)
                : DiklyColors.border),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2))
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
                        a.isUrgent
                            ? Icons.priority_high_rounded
                            : Icons.campaign_rounded,
                        color: _priorityColor,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(a.title,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                          if (a.authorName != null)
                            Text('By ${a.authorName}',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                        color: DiklyColors.textSecondary)),
                        ],
                      ),
                    ),
                    if (a.isUrgent)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                            color: DiklyColors.error.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(6)),
                        child: const Text('URGENT',
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: DiklyColors.error)),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  a.content,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: DiklyColors.textSecondary, height: 1.5),
                  maxLines: _expanded ? null : 3,
                  overflow:
                      _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                ),
                if (a.content.length > 150) ...[
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () =>
                        setState(() => _expanded = !_expanded),
                    child: Text(
                      _expanded ? 'Show less' : 'Read more',
                      style: const TextStyle(
                          color: DiklyColors.primary,
                          fontWeight: FontWeight.w600,
                          fontSize: 13),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (a.createdAt != null)
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(
                color: DiklyColors.background,
                borderRadius:
                    BorderRadius.vertical(bottom: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.access_time_rounded,
                      size: 13, color: DiklyColors.textSecondary),
                  const SizedBox(width: 4),
                  Text(DateFormat('MMM d, yyyy').format(a.createdAt!),
                      style: const TextStyle(
                          fontSize: 11,
                          color: DiklyColors.textSecondary)),
                  if (a.targetRole != null) ...[
                    const SizedBox(width: 12),
                    const Icon(Icons.people_outline_rounded,
                        size: 13, color: DiklyColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(a.targetRole!.toUpperCase(),
                        style: const TextStyle(
                            fontSize: 11,
                            color: DiklyColors.textSecondary,
                            fontWeight: FontWeight.w500)),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
