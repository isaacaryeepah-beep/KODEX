import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class SubscriptionScreen extends StatelessWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        backgroundColor: DiklyColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: const Text('My Subscription'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'My Subscription',
            subtitle: 'Your personal DIKLY access · ₵30 / semester · Paystack only',
          ),

          // 2×2 stat cards
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.45,
            children: const [
              _SubscriptionStatCard(
                value: 'Free Trial',
                title: 'Status',
                icon: Icons.hourglass_empty,
                color: DiklyColors.primary,
              ),
              _SubscriptionStatCard(
                value: 'Free Trial',
                title: 'Plan',
                icon: Icons.star_outline,
                color: DiklyColors.success,
              ),
              _SubscriptionStatCard(
                value: '27',
                title: 'Days Remaining',
                icon: Icons.calendar_today,
                color: DiklyColors.warning,
              ),
              _SubscriptionStatCard(
                value: '—',
                title: 'Trial Ends',
                icon: Icons.event_outlined,
                color: Color(0xFF7C3AED),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Plan card
          DiklyCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Semester Plan',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: DiklyColors.textPrimary),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      '₵30',
                      style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: DiklyColors.primary),
                    ),
                    const SizedBox(width: 6),
                    const Padding(
                      padding: EdgeInsets.only(bottom: 4),
                      child: Text(
                        '/ semester',
                        style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text(
                  '1 semester (16 weeks) · Auto-stacks if renewed early',
                  style: TextStyle(fontSize: 12, color: DiklyColors.textSecondary),
                ),
                const SizedBox(height: 14),
                const Divider(height: 1),
                const SizedBox(height: 14),
                // Feature list
                ...[
                  'Full platform access',
                  'Attendance & sign in/out',
                  'Leave management',
                  'Shift scheduling',
                  'Expense tracking',
                  'Renew any time — days stack up',
                ].map((f) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.check_circle, size: 16, color: DiklyColors.success),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(f, style: const TextStyle(fontSize: 13, color: DiklyColors.textSecondary)),
                      ),
                    ],
                  ),
                )),
                const SizedBox(height: 14),

                // Amber trial banner
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF9C3),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.hourglass_bottom, size: 16, color: Color(0xFF92400E)),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '30-day free trial active — 27 days left. Subscribe before it ends to avoid interruption.',
                          style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Pay button — dark navy per spec
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Redirecting to Paystack...')),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0F172A),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text(
                      'Pay ₵30 with Paystack',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Center(
                  child: Text(
                    'Secured by Paystack · Paid in GHS (₵) · Mobile Money & Card accepted',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: DiklyColors.textMuted),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _SubscriptionStatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _SubscriptionStatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: TextStyle(
                  fontSize: value.length > 6 ? 14 : 20,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  color: DiklyColors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
