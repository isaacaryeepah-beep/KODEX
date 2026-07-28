"use strict";

/**
 * Integration test for checkLecturerSubscriptions() (src/services/emailScheduler.js).
 * Runs against a real MongoDB — mongodb-memory-server in CI, or TEST_MONGO_URI
 * locally — and asserts on which users actually get a trial-ending email.
 *
 * Regression coverage for a real user-reported bug: a corporate-company
 * manager (whose User.trialEndDate is never set by registerManager()) was
 * getting a bogus "trial ends tomorrow" email computed from a hardcoded
 * createdAt+30-day fallback, directly contradicting the company's real,
 * much longer trial (the corporate pilot trial is 188 days — see
 * trialSettings.js) that the same account's welcome email already quoted.
 * Corporate users are governed by Company.trialEndDate via
 * runDailyEmails()/getAdminsForCompany(), not by this per-user check, so
 * checkLecturerSubscriptions() must skip them entirely. It must also skip
 * HODs, who User.js documents as always free of per-user subscription.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-lecsub-suite-00000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-lecsub-suite-000001";
process.env.NODE_ENV           = "test";

jest.mock("../../src/services/emailService", () => ({
  sendTrialEndingSoon: jest.fn(async () => ({ ok: true })),
  sendTrialExpired:    jest.fn(async () => ({ ok: true })),
  sendGraceNudge:      jest.fn(async () => ({ ok: true })),
  sendRenewalReminder: jest.fn(async () => ({ ok: true })),
}));

const mongoose = require("mongoose");
const { sendTrialEndingSoon } = require("../../src/services/emailService");

let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");
const { checkLecturerSubscriptions } = require("../../src/services/emailScheduler");

let corporateCompany, corporateManager, corporateHod;
let academicCompany, academicLecturer;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_lecsub_test");
  }
  await mongoose.connect(uri);

  await Promise.all(
    ["users", "companies"].map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  // Corporate company on the real 188-day pilot trial.
  corporateCompany = await Company.create({
    name: "LecSub Corporate Co " + Date.now(),
    mode: "corporate",
    subscriptionStatus: "trial",
    trialEndDate: new Date(Date.now() + 188 * 24 * 60 * 60 * 1000),
  });

  // Mirrors registerManager(): no trialEndDate/subscriptionStatus set on
  // the user at all -- this is the exact condition that triggered the bug.
  corporateManager = await User.create({
    name: "Repro Manager", email: `mgr${Date.now()}@lecsub.test`, password: "Passw0rd!123",
    role: "manager", company: corporateCompany._id, isActive: true, isApproved: true,
  });

  corporateHod = await User.create({
    name: "Repro HOD", email: `hod${Date.now()}@lecsub.test`, password: "Passw0rd!123",
    role: "hod", company: corporateCompany._id, isActive: true, isApproved: true,
  });

  // Academic company/lecturer whose OWN trial is genuinely about to expire
  // in 1 day -- this per-user reminder must still fire for academic mode.
  academicCompany = await Company.create({
    name: "LecSub Academic Uni " + Date.now(),
    mode: "academic",
    institutionCode: "LSA" + Date.now().toString().slice(-6),
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  academicLecturer = await User.create({
    name: "Repro Lecturer", email: `lect${Date.now()}@lecsub.test`, password: "Passw0rd!123",
    role: "lecturer", company: academicCompany._id, department: "CS",
    isActive: true, isApproved: true,
    trialEndDate: new Date(Date.now() + 20 * 60 * 60 * 1000), // ~20h left -> rounds to daysLeft=1
  });

  await checkLecturerSubscriptions();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe("checkLecturerSubscriptions — corporate users excluded", () => {
  test("does not email a corporate manager, even with no User.trialEndDate set", () => {
    const calledForManager = sendTrialEndingSoon.mock.calls.some(
      (call) => call[0].email === corporateManager.email
    );
    expect(calledForManager).toBe(false);
  });

  test("does not touch a corporate manager's subscriptionStatus", async () => {
    const fresh = await User.findById(corporateManager._id).lean();
    expect(fresh.subscriptionStatus).toBe("trial");
  });

  test("does not email a corporate HOD (HODs are always free of per-user subscription)", () => {
    const calledForHod = sendTrialEndingSoon.mock.calls.some(
      (call) => call[0].email === corporateHod.email
    );
    expect(calledForHod).toBe(false);
  });
});

describe("checkLecturerSubscriptions — academic users still covered", () => {
  test("still emails an academic lecturer whose own trial is ending in ~1 day", () => {
    const call = sendTrialEndingSoon.mock.calls.find(
      (c) => c[0].email === academicLecturer.email
    );
    expect(call).toBeTruthy();
    expect(call[0].daysLeft).toBe(1);
  });
});
