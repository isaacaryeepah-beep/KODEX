import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

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
        return action.contains('updat') || action.contains('edit') ||
            action.contains('modif');
      case _LogFilter.delete:
        return action.contains('delet') || action.contains('remov');
      case _LogFilter.all:
        return true;
    }
  }

  IconData _actionIcon(String action) {
    final lower = action.toLowerCase();
    if (lower.contains('login') || lower.contains('sign')) {
      return Icons.login_rounded;
    }
    if (lower.contains('creat') || lower.contains('add')) {
      return Icons.add_circle_outline_rounded;
    }
    if (lower.contains('updat') || lower.contains('edit') ||
        lower.contains('modif')) {
      return Icons.edit_outlined;
    }
    if (lower.contains('delet') || lower.contains('remov')) {
      return Icons.delete_outline_rounded;
    }
    return Icons.info_outline_rounded;
  }

  Color _actionColor(String action) {
    final lower = action.toLowerCase();
    if (lower.contains('login') || lower.contains('sign')) {
      return DiklyColors.primary;
    }
    if (lower.contains('creat') || lower.contains('add')) {
      return DiklyColors.success;
    }
    if (lower.contains('updat') || lower.contains('edit') ||
        lower.contains('modif')) {
      return DiklyColors.warning;
    }
    if (lower.contains('delet') || lower.contains('remov')) {
      return DiklyColors.error;
    }
    return DiklyColors.textSecondary;
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
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
        title: const Text('Audit Logs'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load audit logs'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_auditLogsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) {
          final filtered =
              data.where((log) => _matchesFilter(log)).toList();

          return Column(
            children: [
              // Filter chips
              Container(
                color: DiklyColors.surface,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(
                    children: _LogFilter.values.map((filter) {
                      final selected = _activeFilter == filter;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          label: Text(_filterLabels[filter]!),
                          selected: selected,
                          onSelected: (_) =>
                              setState(() => _activeFilter = filter),
                          selectedColor: DiklyColors.primary.withOpacity(0.15),
                          checkmarkColor: DiklyColors.primary,
                          labelStyle: TextStyle(
                            color: selected
                                ? DiklyColors.primary
                                : DiklyColors.textSecondary,
                            fontWeight: selected
                                ? FontWeight.w600
                                : FontWeight.w400,
                            fontSize: 13,
                          ),
                          side: BorderSide(
                            color: selected
                                ? DiklyColors.primary
                                : DiklyColors.border,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async => ref.refresh(_auditLogsProvider),
                  child: filtered.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 80),
                            Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.history_rounded,
                                    size: 64,
                                    color: DiklyColors.textSecondary),
                                SizedBox(height: 16),
                                Text(
                                  'No logs found',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                    color: DiklyColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) =>
                              const Divider(height: 1, indent: 56, endIndent: 16),
                          itemBuilder: (context, index) {
                            return _AuditLogTile(
                              log: filtered[index],
                              actionIcon: _actionIcon(
                                  filtered[index]['action']?.toString() ?? ''),
                              actionColor: _actionColor(
                                  filtered[index]['action']?.toString() ?? ''),
                              timeAgo: _timeAgo(
                                  filtered[index]['timestamp']?.toString() ?? ''),
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

class _AuditLogTile extends StatelessWidget {
  final Map<String, dynamic> log;
  final IconData actionIcon;
  final Color actionColor;
  final String timeAgo;

  const _AuditLogTile({
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
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: actionColor.withOpacity(0.1),
              shape: BoxShape.circle,
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
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(
                      timeAgo,
                      style: const TextStyle(
                        fontSize: 11,
                        color: DiklyColors.textSecondary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                if (_details.isNotEmpty)
                  Text(
                    _details,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: DiklyColors.textPrimary,
                    ),
                  )
                else if (_action.isNotEmpty)
                  Text(
                    _action,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: DiklyColors.textPrimary,
                    ),
                  ),
                if (_resource.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    _resource,
                    style: const TextStyle(
                      fontSize: 11,
                      color: DiklyColors.textSecondary,
                    ),
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
