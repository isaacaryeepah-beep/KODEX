import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/user.dart';

class LecturerSearchScreen extends StatefulWidget {
  const LecturerSearchScreen({super.key});

  @override
  State<LecturerSearchScreen> createState() => _LecturerSearchScreenState();
}

class _LecturerSearchScreenState extends State<LecturerSearchScreen> {
  final _searchController = TextEditingController();
  String _selectedFilter = 'All';
  List<User> _results = [];
  bool _loading = false;
  bool _hasSearched = false;
  String? _error;

  final List<String> _filters = ['All', 'Students', 'Lecturers'];

  Future<void> _doSearch() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
      _hasSearched = true;
    });

    try {
      final users = await apiService.getUsers();
      final q = query.toLowerCase();
      final filtered = users.where((u) {
        final matchesQuery = u.name.toLowerCase().contains(q) ||
            u.email.toLowerCase().contains(q) ||
            (u.indexNumber?.toLowerCase().contains(q) ?? false);
        if (!matchesQuery) return false;
        if (_selectedFilter == 'Students') return u.role == 'student';
        if (_selectedFilter == 'Lecturers') return u.role == 'lecturer';
        return true;
      }).toList();

      setState(() {
        _results = filtered;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              'Search',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: DiklyColors.textPrimary,
              ),
            ),
            Text(
              'Find students, lecturers, or staff quickly',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w400,
                color: DiklyColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Search card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onSubmitted: (_) => _doSearch(),
                    decoration: const InputDecoration(
                      hintText: 'Search by name, email, index...',
                      prefixIcon: Icon(Icons.search_rounded,
                          color: DiklyColors.textSecondary, size: 20),
                      border: OutlineInputBorder(
                        borderSide: BorderSide(color: DiklyColors.border),
                        borderRadius: BorderRadius.all(Radius.circular(10)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: DiklyColors.border),
                        borderRadius: BorderRadius.all(Radius.circular(10)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide:
                            BorderSide(color: DiklyColors.primary, width: 2),
                        borderRadius: BorderRadius.all(Radius.circular(10)),
                      ),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: _doSearch,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: DiklyColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                  child: const Text(
                    'Search',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Filter chips
          Row(
            children: _filters.map((f) {
              final selected = _selectedFilter == f;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(f),
                  selected: selected,
                  onSelected: (_) {
                    setState(() => _selectedFilter = f);
                    if (_hasSearched) _doSearch();
                  },
                  selectedColor: DiklyColors.primary,
                  checkmarkColor: Colors.white,
                  labelStyle: TextStyle(
                    color: selected ? Colors.white : DiklyColors.textSecondary,
                    fontWeight:
                        selected ? FontWeight.w600 : FontWeight.w400,
                    fontSize: 13,
                  ),
                  backgroundColor: Colors.white,
                  side: BorderSide(
                    color: selected ? DiklyColors.primary : DiklyColors.border,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          // Content
          if (_loading)
            const Center(
                child: Padding(
              padding: EdgeInsets.only(top: 48),
              child: CircularProgressIndicator(),
            ))
          else if (_error != null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline,
                      size: 48, color: DiklyColors.error),
                  const SizedBox(height: 12),
                  Text(_error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: DiklyColors.textSecondary)),
                  const SizedBox(height: 16),
                  ElevatedButton(
                      onPressed: _doSearch, child: const Text('Retry')),
                ],
              ),
            )
          else if (!_hasSearched)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.search_outlined,
                        size: 64, color: DiklyColors.border),
                    SizedBox(height: 16),
                    Text(
                      'Enter a name, email, or index number to search',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: DiklyColors.textSecondary, fontSize: 14),
                    ),
                  ],
                ),
              ),
            )
          else if (_results.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.person_search_outlined,
                        size: 64, color: DiklyColors.border),
                    SizedBox(height: 16),
                    Text(
                      'No results found',
                      style: TextStyle(
                          color: DiklyColors.textSecondary,
                          fontSize: 15,
                          fontWeight: FontWeight.w600),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Try a different name, email, or index number.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: DiklyColors.textSecondary, fontSize: 13),
                    ),
                  ],
                ),
              ),
            )
          else
            Column(
              children: _results
                  .map((u) => _UserTile(user: u))
                  .toList(),
            ),
        ],
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  final User user;
  const _UserTile({required this.user});

  String get _initials {
    final parts = user.name.trim().split(' ');
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[parts.length - 1][0]}'.toUpperCase();
  }

  Color get _roleColor {
    switch (user.role) {
      case 'student':
        return DiklyColors.primary;
      case 'lecturer':
        return const Color(0xFF7C3AED);
      case 'admin':
        return const Color(0xFFD97706);
      default:
        return DiklyColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: _roleColor.withOpacity(0.15),
            child: Text(
              _initials,
              style: TextStyle(
                color: _roleColor,
                fontWeight: FontWeight.w700,
                fontSize: 14,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.name,
                  style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      color: DiklyColors.textPrimary),
                ),
                const SizedBox(height: 2),
                Text(
                  user.email,
                  style: const TextStyle(
                      fontSize: 12, color: DiklyColors.textSecondary),
                ),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _roleColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              user.role.toUpperCase(),
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: _roleColor,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
