import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/announcement.dart';

final _hodAlertsProvider = FutureProvider.autoDispose<List<Announcement>>(
  (ref) => apiService.getAnnouncements(),
);

class HodAlertsScreen extends ConsumerWidget {
  const HodAlertsScreen({super.key});

  static const _color = Color(0xFF7C2D12);

  IconData _alertIcon(String priority) {
    switch (priority.toLowerCase()) {
      case 'urgent':
      case 'high':
        return Icons.error_outline;
      case 'normal':
        return Icons.info_outline;
      case 'low':
        return Icons.notifications_outlined;
      default:
        return Icons.warning_amber_outlined;
    }
  }

  Color _alertColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'urgent':
      case 'high':
        return DiklyColors.error;
      case 'normal':
        return DiklyColors.primary;
      case 'low':
        return DiklyColors.textSecondary;
      default:
        return DiklyColors.warning;
    }
  }

  String _timeAgo(DateTime? dt) {
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'just now';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(_hodAlertsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Smart Alerts'),
        leading: const BackButton(),
      ),
      body: asyncData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: DiklyColors.error,
              ),
              const SizedBox(height: 12),
              Text(
                'Failed to load alerts',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              TextButton(
                onPressed: () => ref.invalidate(_hodAlertsProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (alerts) {
          if (alerts.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: DiklyColors.border,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.notifications_none_outlined,
                      size: 36,
                      color: DiklyColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No alerts',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'You are all caught up',
                    style: TextStyle(
                      fontSize: 13,
                      color: DiklyColors.textSecondary,
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_hodAlertsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: alerts.length,
              itemBuilder: (_, i) {
                final alert = alerts[i];
                final iconData = _alertIcon(alert.priority);
                final alertColor = _alertColor(alert.priority);
                final timeStr = _timeAgo(alert.createdAt);

                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: alertColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(iconData, color: alertColor, size: 22),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Expanded(
                                  child: Text(
                                    alert.title,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                                if (timeStr.isNotEmpty)
                                  Text(
                                    timeStr,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: DiklyColors.textSecondary,
                                    ),
                                  ),
                              ]),
                              const SizedBox(height: 4),
                              Text(
                                alert.content,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: DiklyColors.textSecondary,
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: alertColor.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  alert.priority.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: alertColor,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
