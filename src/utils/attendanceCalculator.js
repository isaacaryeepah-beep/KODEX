/**
 * Calculate attendance status based on participation
 * present  = attended >= 70% of scheduled duration
 * partial  = attended > 0% but < 70%
 * absent   = never joined
 */
exports.calculateStatus = (totalMinutes, scheduledStart, scheduledEnd) => {
  if (!totalMinutes || totalMinutes <= 0) return 'absent';

  const scheduledMinutes = scheduledStart && scheduledEnd
    ? Math.max(1, (new Date(scheduledEnd) - new Date(scheduledStart)) / 60000)
    : 60; // default 60 min if not set

  const ratio = totalMinutes / scheduledMinutes;
  if (ratio >= 0.7) return 'present';
  if (ratio > 0)    return 'partial';
  return 'absent';
};

/**
 * Sum all completed session minutes for a participant
 */
exports.sumSessionMinutes = (sessions = []) => {
  return sessions.reduce((total, s) => {
    if (s.joinedAt && s.leftAt) {
      const mins = Math.floor((new Date(s.leftAt) - new Date(s.joinedAt)) / 60000);
      return total + Math.max(0, mins);
    }
    return total;
  }, 0);
};
