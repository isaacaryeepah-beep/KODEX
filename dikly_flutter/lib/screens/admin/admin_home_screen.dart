import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../core/auth.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminHomeScreen extends ConsumerStatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  ConsumerState<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends ConsumerState<AdminHomeScreen> {
  Map<String, dynamic>? _reports;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final data = await apiService.getReports();
      setState(() {
        _reports = data;
        _loading = false;
      });
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final firstName = (user?.name ?? 'Admin').split(' ').first;
    final institution = user?.company ?? user?.department ?? 'your institution';
    final deptBadge = user?.department ?? user?.company ?? '';

    return RefreshIndicator(
      onRefresh: _load,
      color: DiklyColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Greeting header
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome back, $firstName',
                      style: GoogleFonts.dmSans(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: DiklyColors.text,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Admin Portal · $institution',
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: DiklyColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              if (deptBadge.isNotEmpty) ...[
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    deptBadge,
                    style: GoogleFonts.dmSans(
                      color: DiklyColors.warning,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 24),

          // Stats section
          Text(
            'Platform Overview',
            style: GoogleFonts.dmSans(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.text,
            ),
          ),
          const SizedBox(height: 14),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: CircularProgressIndicator(color: DiklyColors.primary),
              ),
            )
          else if (_error != null)
            DiklyCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_off_rounded, size: 36, color: Color(0xFF9CA3AF)),
                  const SizedBox(height: 10),
                  const Text(
                    'Failed to load platform stats',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Retry'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: DiklyColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ],
              ),
            )
          else
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.4,
              children: [
                _StatCard(
                  title: 'Total Users',
                  value: (_reports?['totalUsers'] ?? '—').toString(),
                  icon: Icons.people_outlined,
                  color: DiklyColors.primary,
                ),
                _StatCard(
                  title: 'Total Courses',
                  value: (_reports?['totalCourses'] ?? '—').toString(),
                  icon: Icons.book_outlined,
                  color: DiklyColors.success,
                ),
                _StatCard(
                  title: 'Active Sessions',
                  value: (_reports?['activeMeetings'] ?? '—').toString(),
                  icon: Icons.play_circle_outline,
                  color: DiklyColors.warning,
                ),
                _StatCard(
                  title: 'Reports',
                  value: (_reports?['totalLecturers'] ?? '—').toString(),
                  icon: Icons.bar_chart_outlined,
                  color: const Color(0xFF7C3AED),
                ),
              ],
            ),

          const SizedBox(height: 28),

          // Quick Actions
          Text(
            'Quick Actions',
            style: GoogleFonts.dmSans(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: DiklyColors.text,
            ),
          ),
          const SizedBox(height: 14),
          _QuickActionRow(
            actions: [
              _QuickAction(
                icon: Icons.people_outlined,
                label: 'Manage Users',
                color: DiklyColors.primary,
                onTap: () => context.push('/admin/users'),
              ),
              _QuickAction(
                icon: Icons.business_outlined,
                label: 'Manage Branches',
                color: DiklyColors.success,
                onTap: () => context.push('/admin/branches'),
              ),
              _QuickAction(
                icon: Icons.history_outlined,
                label: 'Audit Logs',
                color: DiklyColors.warning,
                onTap: () => context.push('/admin/audit-logs'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.all(16),
      border: Border(top: BorderSide(color: color, width: 3)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: GoogleFonts.dmSans(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: DiklyColors.text,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                title,
                style: GoogleFonts.dmSans(
                  fontSize: 12,
                  color: DiklyColors.textLight,
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

class _QuickActionRow extends StatelessWidget {
  final List<_QuickAction> actions;
  const _QuickActionRow({required this.actions});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: actions
          .map(
            (a) => Expanded(
              child: Padding(
                padding: EdgeInsets.only(
                  right: a == actions.last ? 0 : 10,
                ),
                child: _QuickActionCard(action: a),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _QuickAction {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
}

class _QuickActionCard extends StatelessWidget {
  final _QuickAction action;
  const _QuickActionCard({required this.action});

  @override
  Widget build(BuildContext context) {
    return DiklyCard(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      onTap: action.onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: action.color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(action.icon, color: action.color, size: 22),
          ),
          const SizedBox(height: 8),
          Text(
            action.label,
            textAlign: TextAlign.center,
            style: GoogleFonts.dmSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: DiklyColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
