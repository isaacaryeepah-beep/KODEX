import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/announcement.dart';
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
    setState(() { _loading = true; _error = null; });
    try {
      final announcements = await apiService.getAnnouncements();
      setState(() { _announcements = announcements; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _showPostSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
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
        backgroundColor: DiklyColors.surface,
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
                backgroundColor: DiklyColors.primary,
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
      body: _loading
          ? const Center(child: CircularProgressIndicator())
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
                  ? const DiklyEmptyState(
                      icon: Icons.campaign_outlined,
                      title: 'No announcements',
                      subtitle: 'Announcements will appear here',
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                        children: [
                          DiklyScreenHeader(
                            title: 'Announcements',
                            subtitle: '${_announcements.length} announcement${_announcements.length == 1 ? '' : 's'}',
                          ),
                          ..._announcements.map((a) => _AnnouncementCard(announcement: a)),
                        ],
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showPostSheet,
        backgroundColor: DiklyColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.campaign_outlined),
        label: const Text('Post Announcement', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
    );
  }
}

// ── Post Announcement Bottom Sheet ───────────────────────────────────────────

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
  String _audience = 'All';
  DateTime? _expiresAt;
  bool _posting = false;

  final List<String> _types = ['Info', 'Warning', 'Urgent'];
  final List<String> _audiences = ['All', 'Employees', 'Managers'];

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
    if (picked != null) setState(() => _expiresAt = picked);
  }

  Future<void> _post() async {
    if (_titleCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter a title')));
      return;
    }
    if (_messageCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter a message')));
      return;
    }
    setState(() => _posting = true);
    try {
      await apiService.createAnnouncement({
        'title': _titleCtrl.text.trim(),
        'content': _messageCtrl.text.trim(),
        'type': _type.toLowerCase(),
        'audience': _audience.toLowerCase(),
        if (_expiresAt != null) 'expiresAt': _expiresAt!.toIso8601String(),
      });
      widget.onPosted();
    } catch (e) {
      setState(() => _posting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ${e.toString()}')));
      }
    }
  }

  InputDecoration _fieldDeco({String? hint}) => InputDecoration(
    hintText: hint,
    filled: true,
    fillColor: DiklyColors.surface,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: DiklyColors.primary, width: 2)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    hintStyle: const TextStyle(color: DiklyColors.textMuted, fontSize: 14),
  );

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
                width: 40, height: 4,
                decoration: BoxDecoration(color: DiklyColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Text(
                  'Post Announcement',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: DiklyColors.textSecondary, size: 20),
                  padding: const EdgeInsets.all(6),
                  constraints: const BoxConstraints(),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const Divider(height: 20),

            // Title
            const DiklySectionLabel('TITLE *'),
            const SizedBox(height: 6),
            TextField(controller: _titleCtrl, decoration: _fieldDeco(hint: 'e.g. Office closed tomorrow')),
            const SizedBox(height: 14),

            // Message
            const DiklySectionLabel('MESSAGE *'),
            const SizedBox(height: 6),
            TextField(controller: _messageCtrl, maxLines: 4, decoration: _fieldDeco(hint: 'Enter your announcement...')),
            const SizedBox(height: 14),

            // Type
            const DiklySectionLabel('TYPE'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _type,
              decoration: _fieldDeco(),
              items: _types.map((t) {
                Color c;
                switch (t) {
                  case 'Warning': c = DiklyColors.warning; break;
                  case 'Urgent': c = DiklyColors.error; break;
                  default: c = DiklyColors.primary;
                }
                return DropdownMenuItem(
                  value: t,
                  child: Row(
                    children: [
                      Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
                      const SizedBox(width: 8),
                      Text(t, style: const TextStyle(fontSize: 14)),
                    ],
                  ),
                );
              }).toList(),
              onChanged: (v) => setState(() => _type = v ?? 'Info'),
            ),
            const SizedBox(height: 14),

            // Audience
            const DiklySectionLabel('AUDIENCE'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _audience,
              decoration: _fieldDeco(),
              items: _audiences.map((a) => DropdownMenuItem(value: a, child: Text(a, style: const TextStyle(fontSize: 14)))).toList(),
              onChanged: (v) => setState(() => _audience = v ?? 'All'),
            ),
            const SizedBox(height: 14),

            // Expires At
            const DiklySectionLabel('EXPIRES AT (optional)'),
            const SizedBox(height: 6),
            GestureDetector(
              onTap: _pickExpiry,
              child: AbsorbPointer(
                child: TextField(
                  readOnly: true,
                  controller: TextEditingController(text: _expiresAt != null ? fmt.format(_expiresAt!) : ''),
                  decoration: _fieldDeco(hint: 'No expiry date').copyWith(
                    suffixIcon: const Icon(Icons.calendar_today_outlined, color: DiklyColors.textMuted, size: 18),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: DiklyColors.textSecondary,
                      side: const BorderSide(color: DiklyColors.border),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DiklyPrimaryButton(
                    label: 'Post',
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

// ── Announcement Card ─────────────────────────────────────────────────────────

class _AnnouncementCard extends StatefulWidget {
  final Announcement announcement;
  const _AnnouncementCard({required this.announcement});

  @override
  State<_AnnouncementCard> createState() => _AnnouncementCardState();
}

class _AnnouncementCardState extends State<_AnnouncementCard> {
  bool _expanded = false;

  Color get _typeColor {
    final priority = widget.announcement.priority?.toLowerCase() ?? '';
    if (widget.announcement.isUrgent || priority == 'urgent') return DiklyColors.error;
    if (priority == 'warning' || priority == 'high') return DiklyColors.warning;
    return DiklyColors.primary;
  }

  String get _typeLabel {
    final priority = widget.announcement.priority?.toLowerCase() ?? '';
    if (widget.announcement.isUrgent || priority == 'urgent') return 'Urgent';
    if (priority == 'warning' || priority == 'high') return 'Warning';
    return 'Info';
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.announcement;
    return DiklyCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: _typeColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        a.isUrgent ? Icons.priority_high_rounded : Icons.campaign_rounded,
                        color: _typeColor,
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
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: DiklyColors.textPrimary,
                            ),
                          ),
                          if (a.authorName != null)
                            Text(
                              'By ${a.authorName}',
                              style: const TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    DiklyBadge(label: _typeLabel, color: _typeColor),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  a.content,
                  style: const TextStyle(
                    fontSize: 14,
                    color: DiklyColors.textSecondary,
                    height: 1.5,
                  ),
                  maxLines: _expanded ? null : 3,
                  overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                ),
                if (a.content.length > 150) ...[
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Text(
                      _expanded ? 'Show less' : 'Read more',
                      style: const TextStyle(
                        color: DiklyColors.primary,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          // Footer: date + audience
          if (a.createdAt != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: const BoxDecoration(
                color: DiklyColors.background,
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(10)),
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
