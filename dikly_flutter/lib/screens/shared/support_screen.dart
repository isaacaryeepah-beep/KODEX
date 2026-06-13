import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final List<Map<String, dynamic>> _tickets = [];

  void _showNewTicketDialog() {
    final subjectCtrl = TextEditingController();
    final messageCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('New Support Ticket', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: subjectCtrl,
              decoration: const InputDecoration(labelText: 'Subject', hintText: 'What do you need help with?'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: messageCtrl,
              decoration: const InputDecoration(labelText: 'Message', hintText: 'Describe your issue...'),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              Navigator.pop(context);
              if (subjectCtrl.text.trim().isNotEmpty) {
                setState(() {
                  _tickets.insert(0, {
                    'subject': subjectCtrl.text.trim(),
                    'message': messageCtrl.text.trim(),
                    'status': 'open',
                    'createdAt': DateTime.now(),
                  });
                });
              }
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        title: const Text('Support'),
        leading: BackButton(onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'Support & Helpdesk',
            subtitle: 'Submit and track support tickets',
            action: ElevatedButton.icon(
              onPressed: _showNewTicketDialog,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('+ New Ticket'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                elevation: 0,
                textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          if (_tickets.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: DiklyColors.border),
              ),
              child: const Center(
                child: Text(
                  'No support tickets yet. Click + New Ticket to submit one.',
                  style: TextStyle(fontSize: 13, color: DiklyColors.textSecondary),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            ...(_tickets.map((t) => DiklyCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2563EB).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.support_agent_outlined, size: 20, color: Color(0xFF2563EB)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t['subject'] ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: DiklyColors.text)),
                        if ((t['message'] as String?)?.isNotEmpty == true)
                          Text(t['message'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: DiklyColors.textLight)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: DiklyColors.success.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text('OPEN', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: DiklyColors.success)),
                  ),
                ],
              ),
            ))),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
