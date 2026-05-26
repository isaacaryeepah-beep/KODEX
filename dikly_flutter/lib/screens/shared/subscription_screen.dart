import 'package:flutter/material.dart';
import '../../widgets/stat_card.dart';
import '../../widgets/ds/dikly_ds.dart';

class SubscriptionScreen extends StatelessWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
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
            childAspectRatio: 1.4,
            children: const [
              StatCard(
                value: 'Free Trial',
                title: 'SUBSCRIPTION STATUS',
                icon: Icons.hourglass_empty,
                color: Color(0xFF2563EB),
              ),
              StatCard(
                value: 'Free Trial',
                title: 'CURRENT PLAN',
                icon: Icons.star_outline,
                color: Color(0xFF16A34A),
              ),
              StatCard(
                value: '27',
                title: 'DAYS REMAINING',
                icon: Icons.calendar_today,
                color: Color(0xFFD97706),
              ),
              StatCard(
                value: '—',
                title: 'TRIAL ENDS',
                icon: Icons.event_outlined,
                color: Color(0xFF7C3AED),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Subscribe Now card
          DiklyCard(
            borderRadius: 14,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Subscribe Now', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: const [
                          Text('Semester Plan', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF111827))),
                          Spacer(),
                          Text('₵30', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF2563EB))),
                        ],
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        '⏱ 1 semester (16 weeks) · Auto-stacks if renewed early',
                        style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                      ),
                      const SizedBox(height: 10),
                      ...[
                        'Full platform access',
                        'Attendance marking & session management',
                        'Assessment creation & grading',
                        'Grade book & reports',
                        'Renew any time — days stack up',
                      ].map((f) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.circle, size: 6, color: Color(0xFF6B7280)),
                            const SizedBox(width: 8),
                            Expanded(child: Text(f, style: const TextStyle(fontSize: 13, color: Color(0xFF374151)))),
                          ],
                        ),
                      )),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF9C3),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('⏳', style: TextStyle(fontSize: 16)),
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
                DiklyPrimaryButton(
                  label: '💳  Pay ₵30 with Paystack',
                  color: const Color(0xFF1D4ED8),
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Redirecting to Paystack...')),
                  ),
                ),
                const SizedBox(height: 8),
                const Center(
                  child: Text(
                    'Secured by Paystack · Paid in GHS (₵) · Mobile Money & Card accepted',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
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
