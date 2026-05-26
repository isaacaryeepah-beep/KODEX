import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../widgets/stat_card.dart';

class SubscriptionScreen extends StatelessWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Subscription'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Page header
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'My Subscription',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Your personal DIKLY access · ₵30 / semester · Paystack only',
                style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // 2x2 Stat grid
          Row(
            children: [
              Expanded(
                child: StatCard(
                  value: 'Free Trial',
                  title: 'Subscription Status',
                  icon: Icons.verified_outlined,
                  color: DiklyColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  value: 'Free Trial',
                  title: 'Current Plan',
                  icon: Icons.card_membership_outlined,
                  color: DiklyColors.success,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: StatCard(
                  value: '27',
                  title: 'Days Remaining',
                  icon: Icons.hourglass_bottom_outlined,
                  color: DiklyColors.warning,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  value: '—',
                  title: 'Trial Ends',
                  icon: Icons.event_outlined,
                  color: const Color(0xFF7C3AED),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Subscribe Now card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: DiklyColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: const [
                    Text(
                      'Semester Plan',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: DiklyColors.textPrimary,
                      ),
                    ),
                    Spacer(),
                    Text(
                      '₵30',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF2563EB),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  '⏱ 1 semester (16 weeks) · Auto-stacks if renewed early',
                  style: TextStyle(
                    fontSize: 13,
                    color: DiklyColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 14),
                // Feature list
                _FeatureRow('Full platform access'),
                _FeatureRow(
                    'Attendance marking & session management'),
                _FeatureRow('Assessment creation & grading'),
                _FeatureRow('Grade book & reports'),
                _FeatureRow(
                    'Renew any time — days stack up'),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Amber warning banner
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF9C3),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFFBBF24)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('⏳', style: TextStyle(fontSize: 16)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '30-day free trial active — 27 days left. Subscribe before it ends to avoid interruption.',
                    style: TextStyle(
                      fontSize: 13,
                      color: Color(0xFF92400E),
                      height: 1.4,
                    ),
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
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text('Redirecting to Paystack...')),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E3A5F),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
              child: const Text(
                '💳  Pay ₵30 with Paystack',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 10),

          // Caption
          const Center(
            child: Text(
              'Secured by Paystack · Paid in GHS (₵) · Mobile Money & Card accepted',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: DiklyColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  final String text;
  const _FeatureRow(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle_rounded,
              size: 16, color: DiklyColors.success),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                  fontSize: 13, color: DiklyColors.textSecondary, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
