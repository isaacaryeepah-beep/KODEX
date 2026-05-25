import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/announcement.dart';
import '../../widgets/app_shell.dart';
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
    setState(() { _loading = true; _error = null; });
    try {
      final announcements = await apiService.getAnnouncements();
      setState(() { _announcements = announcements; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppShell(
      title: 'Announcements',
      child: _loading
          ? const LoadingList()
          : _error != null
              ? Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: DiklyColors.error, size: 48),
                    const SizedBox(height: 12),
                    Text(_error!),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                  ],
                ))
              : _announcements.isEmpty
                  ? const EmptyState(icon: Icons.campaign_outlined, title: 'No announcements', subtitle: 'Announcements will appear here')
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _announcements.length,
                        itemBuilder: (ctx, i) => _AnnouncementCard(announcement: _announcements[i]),
                      ),
                    ),
    );
  }
}

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
        border: Border.all(color: a.isUrgent ? DiklyColors.error.withOpacity(0.3) : DiklyColors.border),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
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
                          Text(a.title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                          if (a.authorName != null)
                            Text('By ${a.authorName}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary)),
                        ],
                      ),
                    ),
                    if (a.isUrgent)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: DiklyColors.error.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                        child: const Text('URGENT', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: DiklyColors.error)),
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
              decoration: BoxDecoration(
                color: DiklyColors.background,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.access_time_rounded, size: 13, color: DiklyColors.textSecondary),
                  const SizedBox(width: 4),
                  Text(DateFormat('MMM d, yyyy').format(a.createdAt!), style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary)),
                  if (a.targetRole != null) ...[
                    const SizedBox(width: 12),
                    const Icon(Icons.people_outline_rounded, size: 13, color: DiklyColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(a.targetRole!.toUpperCase(), style: const TextStyle(fontSize: 11, color: DiklyColors.textSecondary, fontWeight: FontWeight.w500)),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}
