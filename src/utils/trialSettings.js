"use strict";

/**
 * trialSettings.js
 *
 * Single source of truth for trial length, shared between authController.js
 * (drives the userTrial banner shown on login/dashboard) and middleware/auth.js
 * (the actual enforcement that locks the account). Both used to hardcode
 * their own 30/45-day fallback independently — if a superadmin shortened
 * trialDays via PlatformSettings, the banner would say "expired" days
 * before enforcement's hardcoded value agreed, producing an account that
 * looked locked-out but kept working fully. Importing from one place makes
 * that drift structurally impossible.
 */

const PlatformSettings = require("../models/PlatformSettings");

const TRIAL_DAYS         = 30;
const STUDENT_TRIAL_DAYS = 45;

async function getTrialDays() {
  try {
    const s = await PlatformSettings.findOne().lean();
    return (s?.trialDays > 0) ? s.trialDays : TRIAL_DAYS;
  } catch {
    return TRIAL_DAYS;
  }
}

async function getStudentTrialDays() {
  try {
    const s = await PlatformSettings.findOne().lean();
    return (s?.studentTrialDays > 0) ? s.studentTrialDays : STUDENT_TRIAL_DAYS;
  } catch {
    return STUDENT_TRIAL_DAYS;
  }
}

module.exports = { TRIAL_DAYS, STUDENT_TRIAL_DAYS, getTrialDays, getStudentTrialDays };
