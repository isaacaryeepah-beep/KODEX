// ─── KODEX Email Scheduler ─────────────────────────────────────────────────
// Runs daily at 08:00 Africa/Accra time
// Checks trial status for every company and sends lifecycle emails

const cron = require('node-cron');
const Company = require('../models/Company');
const User    = require('../models/User');
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
    role: { $in: ['admin', 'lecturer', 'superadmin'] },
    isActive: true,
  }).select('email firstName lastName').lean();
}

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email.split('@')[0];
}

// ── Daily email job ────────────────────────────────────────────────────────────
async function runDailyEmails() {
  console.log('[Scheduler] Running daily email check…');
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

          // Day 14 — expired today
          if (daysGone === 0 && msLeft <= 0) {
            await sendTrialExpired({ email: user.email, name });
          }

          // Day 16 — grace nudge (2 days after expiry)
          if (daysGone === 2) {
            await sendGraceNudge({ email: user.email, name });
          }
        }
      } catch (err) {
        console.error(`[Scheduler] Error processing company ${company._id}:`, err.message);
      }
    }

    // Renewal reminders — subscribed companies expiring in 7 days
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
          await sendRenewalReminder({
            email:   user.email,
            name:    fullName(user),
            plan:    company.subscriptionPlan,
            endDate: company.subscriptionEndDate,
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

// ── Start the cron ─────────────────────────────────────────────────────────────
function startScheduler() {
  // Run every day at 08:00 UTC (= 08:00 Ghana time — Ghana is UTC+0)
  cron.schedule('0 8 * * *', () => {
    runDailyEmails().catch(err => console.error('[Scheduler] Unhandled error:', err));
  }, {
    timezone: 'Africa/Accra',
  });

  console.log('[Scheduler] ✅ Email scheduler started — runs daily at 08:00 Accra time');
}

module.exports = { startScheduler, runDailyEmails };
