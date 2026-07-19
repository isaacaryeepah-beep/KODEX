"use strict";

/**
 * Global subscription-enforcement kill-switch
 * (PlatformSettings.subscriptionEnforced, superadmin-only toggle).
 *
 * When OFF, requireActiveSubscription passes every request platform-wide —
 * a lecturer at an institution with an expired trial and no subscription
 * is no longer blocked. When back ON, the same request is blocked again.
 */

jest.setTimeout(120000);

const crypto = require("crypto");
const randSecret = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");
const randPassword = () => `Test${crypto.randomBytes(6).toString("hex")}!1`;

process.env.JWT_SECRET         = process.env.JWT_SECRET         || randSecret();
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || randSecret();
process.env.NODE_ENV           = "test";

jest.mock("../../src/services/emailService", () => ({
  sendWelcome:                  jest.fn(async () => ({ ok: true })),
  sendAdminPasswordResetNotice: jest.fn(async () => ({ ok: true })),
  sendPasswordReset:            jest.fn(async () => ({ ok: true })),
  sendNewInstitutionAlert:      jest.fn(async () => ({ ok: true })),
  sendLecturerWelcome:          jest.fn(async () => ({ ok: true })),
  sendEmployeeWelcome:          jest.fn(async () => ({ ok: true })),
  sendHodWelcome:               jest.fn(async () => ({ ok: true })),
  sendSelfRegPending:           jest.fn(async () => ({ ok: true })),
  sendAdminNewSelfReg:          jest.fn(async () => ({ ok: true })),
}));

const request  = require("supertest");
const mongoose = require("mongoose");

let app;
let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");
const { clearEnforcementCache } = require("../../src/middleware/subscription");

const PASSWORD = randPassword();
let lecturerToken, superadminToken;

// A subscription-gated request an expired-institution lecturer would make
const gatedRequest = () =>
  request(app).get("/api/attendance-sessions").set("Authorization", `Bearer ${lecturerToken}`);

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_sub_enforcement_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "platformsettings"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );
  clearEnforcementCache();

  // Institution with an expired trial and no subscription
  const company = await Company.create({
    name: "Expired Uni",
    mode: "academic",
    institutionCode: "EXPUNI1",
    subscriptionActive: false,
    subscriptionStatus: "expired",
    trialUsed: true,
    trialEndDate: new Date(Date.now() - 30 * 24 * 3600 * 1000),
  });

  await User.create({
    name: "Blocked Lecturer", email: "lect@expuni.edu", password: PASSWORD,
    role: "lecturer", company: company._id, department: "CS", isActive: true, isApproved: true,
  });
  await User.create({
    name: "Root Superadmin", email: "root@dikly.test", password: PASSWORD,
    role: "superadmin", company: company._id, isActive: true, isApproved: true,
  });

  const lecLogin = await request(app).post("/api/auth/login")
    .send({ email: "lect@expuni.edu", password: PASSWORD, loginRole: "lecturer" });
  expect(lecLogin.status).toBe(200);
  lecturerToken = lecLogin.body.token;

  const rootLogin = await request(app).post("/api/auth/login")
    .send({ email: "root@dikly.test", password: PASSWORD, loginRole: "superadmin" });
  expect(rootLogin.status).toBe(200);
  superadminToken = rootLogin.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("subscription enforcement kill-switch", () => {
  test("with enforcement ON (default), an expired institution's lecturer is blocked", async () => {
    // The authenticate middleware's own subscription gate fires first (402
    // subscriptionExpired) — before requireActiveSubscription's 403 — so
    // that's the block a real expired-institution lecturer hits.
    const r = await gatedRequest();
    expect(r.status).toBe(402);
    expect(r.body.subscriptionExpired).toBe(true);
  });

  test("superadmin reads the current state", async () => {
    const r = await request(app)
      .get("/api/superadmin/subscription-enforcement")
      .set("Authorization", `Bearer ${superadminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(true);
  });

  test("superadmin turns enforcement OFF — the same lecturer now passes", async () => {
    const toggle = await request(app)
      .patch("/api/superadmin/subscription-enforcement")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({ enabled: false });
    expect(toggle.status).toBe(200);
    expect(toggle.body.enabled).toBe(false);

    const r = await gatedRequest();
    expect(r.status).toBe(200);
  });

  test("superadmin turns enforcement back ON — the lecturer is blocked again", async () => {
    const toggle = await request(app)
      .patch("/api/superadmin/subscription-enforcement")
      .set("Authorization", `Bearer ${superadminToken}`)
      .send({ enabled: true });
    expect(toggle.status).toBe(200);
    expect(toggle.body.enabled).toBe(true);

    const r = await gatedRequest();
    expect(r.status).toBe(402);
    expect(r.body.subscriptionExpired).toBe(true);
  });

  test("non-superadmin cannot touch the switch", async () => {
    // With enforcement back ON, this expired-institution lecturer is stopped
    // by the auth-level 402 gate before even reaching the superadmin role
    // gate (403) — refused either way, which is the property that matters.
    const r = await request(app)
      .patch("/api/superadmin/subscription-enforcement")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ enabled: false });
    expect([402, 403]).toContain(r.status);
  });
});
