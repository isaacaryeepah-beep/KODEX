import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/user.dart';
import '../../models/course.dart';
import '../../models/meeting.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/ds/dikly_ds.dart';

class AdminDashboard extends ConsumerStatefulWidget {
  const AdminDashboard({super.key});

  @override
  ConsumerState<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends ConsumerState<AdminDashboard> {
  List<User> _users = [];
  List<Course> _courses = [];
  List<Meeting> _meetings = [];
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
      final results = await Future.wait([
        apiService.getUsers(),
        apiService.getCourses(),
        apiService.getMeetings(),
      ]);
      setState(() {
        _users = results[0] as List<User>;
        _courses = results[1] as List<Course>;
        _meetings = results[2] as List<Meeting>;
        _loading = false;
      });
    } catch (_) {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isHod = user?.role == 'hod';

    return AppShell(
      title: isHod ? 'HOD Dashboard' : 'Admin Dashboard',
      child: RefreshIndicator(
        onRefresh: _loadData,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: DiklyColors.primary))
            : _buildContent(user?.name ?? 'Admin', isHod),
      ),
    );
  }

  Widget _buildContent(String name, bool isHod) {
    final activeSessions = _meetings.where((m) => m.isLive).length;
    final firstName = name.split(' ').first;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // Greeting header — matches web flat style
        WebGreetingHeader(
          greeting: '${_getGreeting()}, $firstName 👋',
          subtitle: "Here's what's happening at Dikly today.",
          institutionCode: 'DIKLY',
          onCopyCode: () {
            HapticFeedback.lightImpact();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Code copied!'), duration: Duration(seconds: 1)),
            );
          },
        ),

        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Stat cards — 2x2 grid matching web's top-border style
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.35,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  WebStatCard(
                    label: 'Total Users',
                    value: '${_users.length}',
                    subtitle: 'Employees & managers',
                    icon: Icons.people_outlined,
                    color: DiklyColors.primary,
                  ),
                  WebStatCard(
                    label: 'Active Sessions',
                    value: '$activeSessions',
                    subtitle: activeSessions == 0 ? 'No active sessions' : 'Live now',
                    icon: Icons.radio_button_checked,
                    color: DiklyColors.success,
                  ),
                  WebStatCard(
                    label: 'Total Sessions',
                    value: '${_meetings.length}',
                    subtitle: 'All time',
                    icon: Icons.video_call_outlined,
                    color: DiklyColors.primary,
                  ),
                  WebStatCard(
                    label: 'Courses',
                    value: '${_courses.length}',
                    subtitle: 'All departments',
                    icon: Icons.school_outlined,
                    color: const Color(0xFF7C3AED),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Quick Actions — pill buttons
              const WebSectionLabel(label: 'Quick Actions'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  QuickActionPill(
                    icon: Icons.person_add_outlined,
                    label: 'Add user',
                    color: DiklyColors.primary,
                    onTap: () => context.go('/admin/users'),
                  ),
                  QuickActionPill(
                    icon: Icons.campaign_outlined,
                    label: 'Post announcement',
                    color: DiklyColors.warning,
                    onTap: () => context.go('/announcements'),
                  ),
                  QuickActionPill(
                    icon: Icons.bar_chart_outlined,
                    label: 'View reports',
                    color: DiklyColors.textSecondary,
                    onTap: () => context.go('/reports'),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // Recent Sessions section
              WebSectionHeader(
                title: 'Recent sessions',
                actionLabel: 'View all →',
                onAction: () => context.go('/sessions'),
              ),
              if (_meetings.isEmpty)
                const WebEmptyCard(message: 'No sessions yet')
              else
                ..._meetings.take(3).map((m) => _SessionTile(meeting: m)),

              const SizedBox(height: 20),

              // Recent Users
              WebSectionHeader(
                title: 'Team Members',
                actionLabel: 'View all →',
                onAction: () => context.go('/admin/users'),
              ),
              if (_users.isEmpty)
                const WebEmptyCard(message: 'No users yet')
              else
                ..._users.take(5).map((u) => _UserTile(user: u)),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ],
    );
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _SessionTile extends StatelessWidget {
  final Meeting meeting;
  const _SessionTile({required this.meeting});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: meeting.isLive ? DiklyColors.success : DiklyColors.textMuted,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  meeting.title,
                  style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text),
                  overflow: TextOverflow.ellipsis,
                ),
                if (meeting.createdBy != null)
                  Text(
                    meeting.createdBy!,
                    style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted),
                  ),
              ],
            ),
          ),
          Text(
            _formatTime(meeting.scheduledStart),
            style: GoogleFonts.dmSans(fontSize: 11, color: DiklyColors.textMuted),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }
}

class _UserTile extends StatelessWidget {
  final User user;
  const _UserTile({required this.user});

  Color get _roleColor {
    switch (user.role) {
      case 'student': return DiklyColors.primary;
      case 'lecturer': return const Color(0xFF7C3AED);
      case 'admin': return DiklyColors.warning;
      case 'manager': return const Color(0xFF0D9488);
      case 'employee': return DiklyColors.success;
      default: return DiklyColors.textSecondary;
    }
  }

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: _roleColor.withOpacity(0.1),
            child: Text(_initials, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _roleColor)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name, style: GoogleFonts.dmSans(fontSize: 14, fontWeight: FontWeight.w600, color: DiklyColors.text), overflow: TextOverflow.ellipsis),
                Text(user.email, style: GoogleFonts.dmSans(fontSize: 12, color: DiklyColors.textMuted), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _roleColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              user.role.toUpperCase(),
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: _roleColor, letterSpacing: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}
