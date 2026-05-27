import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
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
    final students = _users.where((u) => u.role == 'student').length;
    final lecturers = _users.where((u) => u.role == 'lecturer').length;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: isHod
                  ? [const Color(0xFFDC2626), const Color(0xFFB91C1C)]
                  : [const Color(0xFFD97706), const Color(0xFFB45309)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${_getGreeting()},', style: const TextStyle(color: Colors.white70, fontSize: 14)),
              const SizedBox(height: 4),
              Text(name, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(DateFormat('EEEE, MMMM d').format(DateTime.now()), style: const TextStyle(color: Colors.white70, fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text('Platform Overview', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.8,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            DiklyStatCard(label: 'Total Users', value: '${_users.length}', color: DiklyColors.primary, icon: Icons.people_outlined),
            DiklyStatCard(label: 'Courses', value: '${_courses.length}', color: const Color(0xFF7C3AED), icon: Icons.school_outlined),
            DiklyStatCard(label: 'Students', value: '$students', color: DiklyColors.success, icon: Icons.person_outlined),
            DiklyStatCard(label: 'Lecturers', value: '$lecturers', color: DiklyColors.warning, icon: Icons.person_pin_outlined),
          ],
        ),
        const SizedBox(height: 20),
        Text('Quick Actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 3,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _GridAction(label: 'Users', icon: Icons.people_rounded, color: DiklyColors.primary, onTap: () => context.go('/admin/users')),
            _GridAction(label: 'Courses', icon: Icons.school_rounded, color: const Color(0xFF7C3AED), onTap: () => context.go('/courses')),
            _GridAction(label: 'Sessions', icon: Icons.video_call_rounded, color: DiklyColors.success, onTap: () => context.go('/sessions')),
            _GridAction(label: 'Meetings', icon: Icons.groups_rounded, color: DiklyColors.warning, onTap: () => context.go('/meetings')),
            _GridAction(label: 'Reports', icon: Icons.bar_chart_rounded, color: const Color(0xFFDC2626), onTap: () => context.go('/reports')),
            _GridAction(label: 'Announce', icon: Icons.campaign_rounded, color: DiklyColors.error, onTap: () => context.go('/announcements')),
          ],
        ),
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Recent Users', style: Theme.of(context).textTheme.titleLarge),
            TextButton(onPressed: () => context.go('/admin/users'), child: const Text('See all')),
          ],
        ),
        const SizedBox(height: 8),
        for (final user in _users.take(5))
          _UserTile(user: user),
        const SizedBox(height: 32),
      ],
    );
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }
}

class _GridAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _GridAction({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(height: 6),
            Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
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
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: _roleColor.withOpacity(0.1),
            child: Text(_initials, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _roleColor)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(user.name, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                Text(user.email, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: DiklyColors.textSecondary), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _roleColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(user.role.toUpperCase(), style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: _roleColor, letterSpacing: 0.5)),
          ),
        ],
      ),
    );
  }
}
