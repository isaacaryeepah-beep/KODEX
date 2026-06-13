import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

// ── Subscription data provider ────────────────────────────────────────────────

final _subscriptionProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) async {
    try {
      return await apiService.getSubscription();
    } catch (_) {
      return {};
    }
  },
);

// ── Static plan features ──────────────────────────────────────────────────────

const _features = [
  'Full student portal access',
  'Attend classes & mark attendance',
  'Take quizzes & assignments',
  'View grades & results',
  'Access the secure exam portal',
];

// ── Screen ────────────────────────────────────────────────────────────────────

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_subscriptionProvider);

    final data = async.maybeWhen(data: (d) => d, orElse: () => <String, dynamic>{});
    final statusRaw = data['status']?.toString() ?? 'trial';
    final planRaw = data['plan']?.toString() ?? 'Free Trial';
    final daysLeft = (data['daysLeft'] as num?)?.toInt() ?? 25;
    final trialEnds = data['trialEnds']?.toString() ?? '—';

    final isTrial = statusRaw.toLowerCase() == 'trial' || statusRaw.isEmpty;
    final statusLabel = isTrial ? 'Free Trial' : statusRaw;
    final planLabel = isTrial ? 'Free Trial' : planRaw;

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Subscription'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          const SizedBox(height: 16),

          // ── Header ─────────────────────────────────────────────────────
          const Text(
            'My Subscription',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
          ),
          const SizedBox(height: 4),
          const Text(
            'Your personal DIKLY access · ₵30 / semester · Paystack only',
            style: TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
          ),

          const SizedBox(height: 20),

          // ── 2×2 Stats grid ──────────────────────────────────────────────
          GridView.count(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.5,
            children: [
              _StatCard(
                label: 'SUBSCRIPTION STATUS',
                value: statusLabel,
                borderColor: const Color(0xFFFCD34D),
                valueColor: const Color(0xFFD97706),
              ),
              _StatCard(
                label: 'CURRENT PLAN',
                value: planLabel,
                borderColor: const Color(0xFFD8B4FE),
                valueColor: const Color(0xFF7C3AED),
              ),
              _StatCard(
                label: 'DAYS REMAINING',
                value: '$daysLeft',
                borderColor: const Color(0xFFFCD34D),
                valueColor: const Color(0xFFD97706),
              ),
              _StatCard(
                label: 'TRIAL ENDS',
                value: trialEnds,
                borderColor: const Color(0xFFD8B4FE),
                valueColor: const Color(0xFF7C3AED),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // ── Subscribe Now card ──────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Subscribe Now',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                const SizedBox(height: 14),

                // Plan name + price
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const Text('Student Semester Plan',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                    const Spacer(),
                    const Text('₵30',
                        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFF2563EB))),
                  ],
                ),

                const SizedBox(height: 6),

                // Duration note
                Row(
                  children: const [
                    Icon(Icons.access_time_rounded, size: 14, color: Color(0xFF6B7280)),
                    SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        '1 semester (16 weeks) · Auto-stacks if renewed early',
                        style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 14),
                const Divider(height: 1),
                const SizedBox(height: 14),

                // Feature bullets
                ..._features.map((f) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        margin: const EdgeInsets.only(top: 3),
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: Color(0xFF2563EB),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(f, style: const TextStyle(fontSize: 13, color: Color(0xFF374151))),
                      ),
                    ],
                  ),
                )),

                const SizedBox(height: 14),

                // Trial warning banner
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFBEB),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFFCD34D)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFFD97706)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '30-day free trial active — $daysLeft days left. '
                          'Subscribe before it ends to avoid interruption.',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.5),
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Pay button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      final uri = Uri.parse('https://dikly.sbs/subscribe');
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text(
                      'Pay ₵30 with Paystack',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                const Center(
                  child: Text(
                    'Secured by Paystack · Paid in GHS (₵) · Mobile Money & Card accepted',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
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

// ── Stat card ────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color borderColor;
  final Color valueColor;

  const _StatCard({
    required this.label,
    required this.value,
    required this.borderColor,
    required this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor, width: 1.5),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: valueColor),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF9CA3AF), letterSpacing: 0.4),
          ),
        ],
      ),
    );
  }
}
