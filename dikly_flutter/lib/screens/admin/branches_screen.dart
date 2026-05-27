import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api.dart';
import '../../core/theme.dart';

final _branchesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => apiService.getBranches(),
);

class BranchesScreen extends ConsumerWidget {
  const BranchesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_branchesProvider);

    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Branches'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddBranchSheet(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Add Branch'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: DiklyColors.error),
              const SizedBox(height: 12),
              const Text('Failed to load branches'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.refresh(_branchesProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () async => ref.refresh(_branchesProvider),
          child: data.isEmpty
              ? ListView(
                  children: const [
                    SizedBox(height: 100),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.business_outlined,
                            size: 72, color: DiklyColors.textSecondary),
                        SizedBox(height: 16),
                        Text(
                          'No branches added yet',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                            color: DiklyColors.textSecondary,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'Tap "Add Branch" to create one',
                          style: TextStyle(color: DiklyColors.textSecondary),
                        ),
                      ],
                    ),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                  itemCount: data.length,
                  itemBuilder: (context, index) =>
                      _BranchCard(branch: data[index]),
                ),
        ),
      ),
    );
  }

  void _showAddBranchSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: DiklyColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _AddBranchSheet(
        onCreated: () => ref.refresh(_branchesProvider),
      ),
    );
  }
}

class _BranchCard extends StatelessWidget {
  final Map<String, dynamic> branch;

  const _BranchCard({required this.branch});

  String get _name => branch['name']?.toString() ?? 'Unknown Branch';
  String get _address => branch['address']?.toString() ?? '';
  int get _employeeCount =>
      (branch['employeeCount'] as num?)?.toInt() ?? 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: DiklyColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: DiklyColors.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: DiklyColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.business_rounded,
              color: DiklyColors.primary,
              size: 24,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _name,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                if (_address.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined,
                          size: 13, color: DiklyColors.textSecondary),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          _address,
                          style: const TextStyle(
                            fontSize: 12,
                            color: DiklyColors.textSecondary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: DiklyColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: DiklyColors.primary.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.people_outline_rounded,
                    size: 13, color: DiklyColors.primary),
                const SizedBox(width: 4),
                Text(
                  '$_employeeCount',
                  style: const TextStyle(
                    color: DiklyColors.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
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

class _AddBranchSheet extends StatefulWidget {
  final VoidCallback onCreated;

  const _AddBranchSheet({required this.onCreated});

  @override
  State<_AddBranchSheet> createState() => _AddBranchSheetState();
}

class _AddBranchSheetState extends State<_AddBranchSheet> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await apiService.createBranch({
        'name': _nameController.text.trim(),
        'address': _addressController.text.trim(),
      });
      if (mounted) {
        widget.onCreated();
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Branch created successfully'),
            backgroundColor: DiklyColors.success,
          ),
        );
      }
    } catch (e) {
      setState(() {
        _error = 'Failed to create branch. Please try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 20, 16, 24 + bottomInset),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: DiklyColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Add Branch',
              style: theme.textTheme.headlineSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Branch Name',
                hintText: 'e.g. Accra Main Office',
                prefixIcon: Icon(Icons.business_outlined),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Branch name is required' : null,
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _addressController,
              decoration: const InputDecoration(
                labelText: 'Address',
                hintText: 'e.g. 25 Independence Ave, Accra',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Address is required' : null,
              textCapitalization: TextCapitalization.sentences,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: DiklyColors.error, fontSize: 13),
              ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Create Branch'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
