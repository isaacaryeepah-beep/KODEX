// ─── KODEX Email Scheduler ─────────────────────────────────────────────────
// Runs daily at 08:00 Africa/Accra time
// Checks trial status for every company and sends lifecycle emails

const cron = require('node-cron');
const Company     = require('../models/Company');
const User        = require('../models/User');
const DeviceLock  = require('../models/DeviceLock');
const QuizSession = require('../models/QuizSession');
const Quiz        = require('../models/Quiz');
const {
  sendTrialEndingSoon,
  sendTrialExpired,
  sendGraceNudge,
  sendRenewalReminder,
} = require('./emailService');

// ── Helper: get admin/lecturer users for a company ────────────────────────────
async function getAdminsForCompany(companyId) {
  return User.find({
    company: companyId,
    role: { $in: ['admin', 'manager'] },
    isActive: true,
  }).select('email name').lean();
}

function fullName(user) {
  return user.name || user.email.split('@')[0];
}

// ── Daily email job ────────────────────────────────────────────────────────────
async function runDailyEmails() {
  console.log('[Scheduler] Running daily email check...');
  const now = new Date();

  try {
    // Fetch all non-subscribed companies
    const companies = await Company.find({ subscriptionActive: { $ne: true } }).lean();
    console.log(`[Scheduler] Checking ${companies.length} trial/expired companies`);

    for (const company of companies) {
      try {
        const trialEnd  = company.trialEndDate ? new Date(company.trialEndDate) : null;
        if (!trialEnd) continue;

        const msLeft    = trialEnd - now;
        const daysLeft  = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        const daysGone  = Math.floor((now - trialEnd) / (1000 * 60 * 60 * 24)); // negative if still in trial

        const users = await getAdminsForCompany(company._id);
        if (!users.length) continue;

        for (const user of users) {
          const name = fullName(user);

          // Day 10 reminder (4 days left)
          if (daysLeft === 4) {
            await sendTrialEndingSoon({ email: user.email, name, daysLeft: 4, trialEndDate: trialEnd });
          }

          // Day 13 reminder (1 day left)
          if (daysLeft === 1) {
            await sendTrialEndingSoon({ email: user.email, name, daysLeft: 1, trialEndDate: trialEnd });
          }

          // Day 14 -- expired today
          if (daysGone === 0 && msLeft <= 0) {
            await sendTrialExpired({ email: user.email, name });
          }

          // Day 16 -- grace nudge (2 days after expiry)
          if (daysGone === 2) {
            await sendGraceNudge({ email: user.email, name });
          }
        }
      } catch (err) {
        console.error(`[Scheduler] Error processing company ${company._id}:`, err.message);
      }
    }

    // Renewal reminders -- subscribed companies expiring in 7 days
    const subCompanies = await Company.find({
      subscriptionActive: true,
      subscriptionEndDate: {
        $gte: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
        $lte: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
      },
    }).lean();

    for (const company of subCompanies) {
      try {
        const users = await getAdminsForCompany(company._id);
        for (const user of users) {
          const planPrice = company.subscriptionPlan === 'annual' ? 2000 : 200;
          await sendRenewalReminder({
            email:     user.email,
            name:      fullName(user),
            plan:      company.subscriptionPlan,
            endDate:   company.subscriptionEndDate,
            amountGhs: planPrice,
          });
        }
      } catch (err) {
        console.error(`[Scheduler] Renewal reminder error for ${company._id}:`, err.message);
      }
    }

    console.log('[Scheduler] Daily email check complete');
  } catch (err) {
    console.error('[Scheduler] Fatal error:', err.message);
  }
}

// ── Stale device lock cleanup ─────────────────────────────────────────────────
// Runs every 5 minutes.
// A lock is stale if:
//   - isActive: true
//   - session lastHeartbeat older than quiz.timeLimit + 10 min grace
//   - OR session already terminated/completed/expired
async function cleanStaleLocks() {
  try {
    const now = new Date();

    // 1. Release locks whose session is already ended
    const endedSessions = await QuizSession.find({
      status: { $in: ['terminated', 'completed', 'expired'] },
    }).select('_id').lean();

    if (endedSessions.length) {
      const endedIds = endedSessions.map(s => s._id);
      const r1 = await DeviceLock.updateMany(
        { session: { $in: endedIds }, isActive: true },
        { isActive: false, releasedAt: now, releaseReason: 'expired' }
      );
      if (r1.modifiedCount > 0) {
        console.log(`[LockCleanup] Released ${r1.modifiedCount} lock(s) for ended sessions`);
      }
    }

    // 2. Release locks whose heartbeat has gone cold
    const activeLocks = await DeviceLock.find({ isActive: true })
      .populate({ path: 'session', select: 'lastHeartbeat status quiz' })
      .lean();

    const lockIdsToExpire = [];
    let expiredCount = 0;

    for (const lock of activeLocks) {
      const session = lock.session;
      // No session or already ended -- release
      if (!session || session.status !== 'active') {
        lockIdsToExpire.push(lock._id);
        continue;
      }

      const quiz = await Quiz.findById(session.quiz).select('timeLimit').lean();
      const limitMs = ((quiz?.timeLimit || 60) + 10) * 60 * 1000; // +10 min grace
      const age = now - new Date(session.lastHeartbeat);

      if (age > limitMs) {
        lockIdsToExpire.push(lock._id);
        await QuizSession.findByIdAndUpdate(session._id, {
          status: 'expired',
          endedAt: now,
          terminationReason: 'stale_lock_cleanup',
        });
        expiredCount++;
      }
    }

    if (lockIdsToExpire.length) {
      await DeviceLock.updateMany(
        { _id: { $in: lockIdsToExpire }, isActive: true },
        { isActive: false, releasedAt: now, releaseReason: 'expired' }
      );
      console.log(`[LockCleanup] Expired ${lockIdsToExpire.length} stale lock(s) (${expiredCount} heartbeat timeouts)`);
    }

  } catch (err) {
    console.error('[LockCleanup] Error:', err.message);
  }
}

// ── Start the cron ─────────────────────────────────────────────────────────────
function startScheduler() {
  // Daily email check at 08:00 Ghana time
  cron.schedule('0 8 * * *', () => {
    runDailyEmails().catch(err => console.error('[Scheduler] Unhandled error:', err));
  }, { timezone: 'Africa/Accra' });

  // Stale lock cleanup every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    cleanStaleLocks().catch(err => console.error('[LockCleanup] Unhandled error:', err));
  });

  console.log('[Scheduler] ✅ Email scheduler started -- runs daily at 08:00 Accra time');
  console.log('[Scheduler] ✅ Stale lock cleanup started -- runs every 5 minutes');
}

module.exports = { startScheduler, runDailyEmails, cleanStaleLocks };
