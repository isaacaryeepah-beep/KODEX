import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

final _auditLogsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getAuditLogs(),
);

enum _LogFilter { all, login, create, update, delete }

class AuditLogsScreen extends ConsumerStatefulWidget {
  const AuditLogsScreen({super.key});

  @override
  ConsumerState<AuditLogsScreen> createState() => _AuditLogsScreenState();
}

class _AuditLogsScreenState extends ConsumerState<AuditLogsScreen> {
  _LogFilter _activeFilter = _LogFilter.all;

  static const _filterLabels = {
    _LogFilter.all: 'All',
    _LogFilter.login: 'Login',
    _LogFilter.create: 'Create',
    _LogFilter.update: 'Update',
    _LogFilter.delete: 'Delete',
  };

  bool _matchesFilter(Map<String, dynamic> log) {
    if (_activeFilter == _LogFilter.all) return true;
    final action = log['action']?.toString().toLowerCase() ?? '';
    switch (_activeFilter) {
      case _LogFilter.login:
        return action.contains('login') || action.contains('sign');
      case _LogFilter.create:
        return action.contains('creat') || action.contains('add');
      case _LogFilter.update:
        return action.contains('updat') ||
            action.contains('edit') ||
            action.contains('modif');
      case _LogFilter.delete:
        return action.contains('delet') || action.contains('remov');
      case _LogFilter.all:
        return true;
    }
  }

  Color _actionColor(String action) {
    final lower = action.toLowerCase();
    if (lower.contains('login') || lower.contains('sign')) return DiklyColors.primary;
    if (lower.contains('creat') || lower.contains('add')) return DiklyColors.success;
    if (lower.contains('updat') || lower.contains('edit') || lower.contains('modif')) {
      return DiklyColors.warning;
    }
    if (lower.contains('delet') || lower.contains('remov')) return DiklyColors.error;
    return DiklyColors.textLight;
  }

  IconData _actionIcon(String action) {
    final lower = action.toLowerCase();
    if (lower.contains('login') || lower.contains('sign')) return Icons.login_rounded;
    if (lower.contains('creat') || lower.contains('add')) return Icons.add_circle_outline_rounded;
    if (lower.contains('updat') || lower.contains('edit') || lower.contains('modif')) {
      return Icons.edit_outlined;
    }
    if (lower.contains('delet') || lower.contains('remov')) return Icons.delete_outline_rounded;
    return Icons.info_outline_rounded;
  }

  String _timeAgo(String raw) {
    try {
      final dt = DateTime.parse(raw).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);
      if (diff.inSeconds < 60) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      final months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${dt.day} ${months[dt.month - 1]}';
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_auditLogsProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        leading: BackButton(
          color: DiklyColors.text,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          'Audit Logs',
          style: GoogleFonts.dmSans(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: DiklyColors.text,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: DiklyColors.border),
        ),
      ),
      body: async.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: DiklyColors.primary),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
                const SizedBox(height: 12),
                Text(
                  'Failed to load audit logs',
                  style: GoogleFonts.dmSans(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: DiklyColors.text,
                  ),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () => ref.refresh(_auditLogsProvider),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (data) {
          final filtered = data.where(_matchesFilter).toList();

          return Column(
            children: [
              // Filter chips bar
              Container(
                color: DiklyColors.surface,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _LogFilter.values.map((filter) {
                      final selected = _activeFilter == filter;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: GestureDetector(
                          onTap: () => setState(() => _activeFilter = filter),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: selected ? DiklyColors.primary : DiklyColors.background,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: selected ? DiklyColors.primary : DiklyColors.border,
                              ),
                            ),
                            child: Text(
                              _filterLabels[filter]!,
                              style: GoogleFonts.dmSans(
                                fontSize: 12,
                                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                                color: selected ? Colors.white : DiklyColors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
              const Divider(height: 1, color: DiklyColors.border),

              // Log list
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async => ref.refresh(_auditLogsProvider),
                  color: DiklyColors.primary,
                  child: filtered.isEmpty
                      ? ListView(
                          children: [
                            const SizedBox(height: 60),
                            DiklyEmptyState(
                              icon: Icons.history_rounded,
                              iconColor: DiklyColors.textLight,
                              iconBg: DiklyColors.background,
                              title: 'No logs found',
                              subtitle: 'Audit logs will appear here.',
                            ),
                          ],
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                          itemCount: filtered.length,
                          itemBuilder: (context, index) {
                            final log = filtered[index];
                            final action = log['action']?.toString() ?? '';
                            final color = _actionColor(action);
                            final icon = _actionIcon(action);
                            final timeAgo = _timeAgo(
                              log['timestamp']?.toString() ?? '',
                            );
                            return _AuditLogCard(
                              log: log,
                              actionIcon: icon,
                              actionColor: color,
                              timeAgo: timeAgo,
                            );
                          },
                        ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _AuditLogCard extends StatelessWidget {
  final Map<String, dynamic> log;
  final IconData actionIcon;
  final Color actionColor;
  final String timeAgo;

  const _AuditLogCard({
    required this.log,
    required this.actionIcon,
    required this.actionColor,
    required this.timeAgo,
  });

  String get _actor => log['actor']?.toString() ?? 'Unknown';
  String get _action => log['action']?.toString() ?? '';
  String get _resource => log['resource']?.toString() ?? '';
  String get _details => log['details']?.toString() ?? '';

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border(
          left: BorderSide(color: actionColor, width: 3),
          top: const BorderSide(color: DiklyColors.border, width: 1),
          right: const BorderSide(color: DiklyColors.border, width: 1),
          bottom: const BorderSide(color: DiklyColors.border, width: 1),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: actionColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(actionIcon, size: 18, color: actionColor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _actor,
                          style: GoogleFonts.dmSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: DiklyColors.text,
                          ),
                        ),
                      ),
                      Text(
                        timeAgo,
                        style: GoogleFonts.dmSans(
                          fontSize: 11,
                          color: DiklyColors.textLight,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  if (_details.isNotEmpty)
                    Text(
                      _details,
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textSecondary,
                      ),
                    )
                  else if (_action.isNotEmpty)
                    Text(
                      _action,
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                  if (_resource.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      _resource,
                      style: GoogleFonts.dmSans(
                        fontSize: 11,
                        color: DiklyColors.textLight,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
