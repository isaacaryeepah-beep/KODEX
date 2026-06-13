import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../widgets/ds/dikly_ds.dart';

class HodQuizMonitorScreen extends StatelessWidget {
  const HodQuizMonitorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: DiklyColors.background,
      appBar: AppBar(
        leading: const BackButton(),
        title: const Text('Quiz Monitor'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DiklyScreenHeader(
            title: 'Quiz Monitor',
            subtitle: 'No open quizzes right now',
          ),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: DiklyColors.border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.assignment_outlined, size: 32, color: Color(0xFF9CA3AF)),
                ),
                const SizedBox(height: 20),
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                    children: [
                      const TextSpan(text: 'Open a quiz from the '),
                      WidgetSpan(
                        child: GestureDetector(
                          onTap: () => context.push('/quizzes'),
                          child: const Text(
                            'Quizzes',
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFF2563EB),
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                      ),
                      const TextSpan(text: ' page to see live student status here.'),
                    ],
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
