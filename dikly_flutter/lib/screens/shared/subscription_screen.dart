import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _subscriptionProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => apiService.getSubscription(),
);

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_subscriptionProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Subscription'),
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
              const Text('Failed to load subscription'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_subscriptionProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) => _SubscriptionBody(data: data),
      ),
    );
  }
}

class _SubscriptionBody extends StatelessWidget {
  final Map<String, dynamic> data;

  const _SubscriptionBody({required this.data});

  String get _plan => data['plan']?.toString() ?? 'Free';
  String get _status => data['status']?.toString() ?? 'active';
  int get _daysLeft => (data['daysLeft'] as num?)?.toInt() ?? 0;
  String get _expiryDate => data['expiryDate']?.toString() ?? '';
  List<String> get _features {
    final raw = data['features'];
    if (raw is List) return raw.map((e) => e.toString()).toList();
    return [];
  }

  bool get _isExpired => _status.toLowerCase() == 'expired';
  bool get _isTrial => _status.toLowerCase() == 'trial';
  bool get _isActive => _status.toLowerCase() == 'active';

  Color _planColor() {
    switch (_plan.toLowerCase()) {
      case 'pro':
        return const Color(0xFF7C3AED);
      case 'enterprise':
        return const Color(0xFFD97706);
      default:
        return DiklyColors.textSecondary;
    }
  }

  Color _statusColor() {
    if (_isActive) return DiklyColors.success;
    if (_isTrial) return DiklyColors.warning;
    return DiklyColors.error;
  }

  Future<void> _openUpgradeLink() async {
    final uri = Uri.parse('https://dikly.sbs/subscribe');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Progress is daysLeft / total, cap at 1.0
    // We'll infer "total days" from a rough assumption (365 for active/trial)
    final progress = _daysLeft > 0
        ? (_daysLeft / (_isExpired ? 1 : 365)).clamp(0.0, 1.0)
        : 0.0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Plan card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                _planColor().withOpacity(0.9),
                _planColor().withOpacity(0.6),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _plan.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.25),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withOpacity(0.4)),
                    ),
                    child: Text(
                      _status.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                _isExpired
                    ? 'Your plan has expired'
                    : '$_daysLeft days remaining',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (_expiryDate.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'Expires: $_expiryDate',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.8),
                    fontSize: 13,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress.toDouble(),
                  backgroundColor: Colors.white.withOpacity(0.3),
                  valueColor:
                      const AlwaysStoppedAnimation<Color>(Colors.white),
                  minHeight: 8,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Status banner
        if (_isActive)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: DiklyColors.success.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: DiklyColors.success.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_rounded,
                    color: DiklyColors.success, size: 22),
                const SizedBox(width: 10),
                Text(
                  'Plan Active — All features unlocked',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: DiklyColors.success, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),

        if (_isExpired || _isTrial) ...[
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _openUpgradeLink,
              icon: const Icon(Icons.rocket_launch_rounded),
              label: const Text('Upgrade Plan'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _isExpired
                    ? DiklyColors.error
                    : DiklyColors.warning,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ],

        const SizedBox(height: 24),

        // Features list
        if (_features.isNotEmpty) ...[
          Text(
            'Included Features',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: DiklyColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: Column(
              children: List.generate(_features.length, (i) {
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: DiklyColors.success.withOpacity(0.1),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.check_rounded,
                              size: 14,
                              color: DiklyColors.success,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _features[i],
                              style: theme.textTheme.bodyMedium,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (i < _features.length - 1)
                      const Divider(height: 1, indent: 16, endIndent: 16),
                  ],
                );
              }),
            ),
          ),
        ],
        const SizedBox(height: 32),
      ],
    );
  }
}
