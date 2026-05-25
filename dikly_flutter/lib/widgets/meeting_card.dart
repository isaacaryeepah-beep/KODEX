import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/meeting.dart';
import '../core/theme.dart';

class MeetingCard extends StatelessWidget {
  final Meeting meeting;
  final VoidCallback? onJoin;
  final VoidCallback? onStart;
  final VoidCallback? onEnd;
  final VoidCallback? onTap;

  const MeetingCard({
    super.key,
    required this.meeting,
    this.onJoin,
    this.onStart,
    this.onEnd,
    this.onTap,
  });

  Color get _statusColor {
    if (meeting.isLive) return DiklyColors.success;
    if (meeting.isEnded) return DiklyColors.textSecondary;
    return DiklyColors.warning;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: DiklyColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: meeting.isLive ? DiklyColors.success.withOpacity(0.3) : DiklyColors.border,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    meeting.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: DiklyColors.textPrimary,
                        ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                _StatusBadge(
                  label: meeting.statusLabel,
                  color: _statusColor,
                  isLive: meeting.isLive,
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.category_outlined, size: 14, color: DiklyColors.textSecondary),
                const SizedBox(width: 4),
                Text(
                  meeting.meetingType.replaceAll('_', ' ').toUpperCase(),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: DiklyColors.textSecondary,
                        letterSpacing: 0.5,
                      ),
                ),
                const SizedBox(width: 16),
                if (meeting.scheduledStart != null) ...[
                  const Icon(Icons.schedule_outlined, size: 14, color: DiklyColors.textSecondary),
                  const SizedBox(width: 4),
                  Text(
                    DateFormat('MMM d, h:mm a').format(meeting.scheduledStart!),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: DiklyColors.textSecondary,
                        ),
                  ),
                ],
              ],
            ),
            if (onJoin != null || onStart != null || onEnd != null) ...[
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (onStart != null && meeting.isScheduled)
                    _ActionButton(
                      label: 'Start',
                      icon: Icons.play_arrow_rounded,
                      color: DiklyColors.success,
                      onTap: onStart!,
                    ),
                  if (onJoin != null && meeting.isLive) ...[
                    const SizedBox(width: 8),
                    _ActionButton(
                      label: 'Join',
                      icon: Icons.video_call_rounded,
                      color: DiklyColors.primary,
                      onTap: onJoin!,
                    ),
                  ],
                  if (onEnd != null && meeting.isLive) ...[
                    const SizedBox(width: 8),
                    _ActionButton(
                      label: 'End',
                      icon: Icons.stop_rounded,
                      color: DiklyColors.error,
                      onTap: onEnd!,
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final bool isLive;

  const _StatusBadge({
    required this.label,
    required this.color,
    this.isLive = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isLive) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 16),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        minimumSize: const Size(0, 36),
      ),
    );
  }
}
