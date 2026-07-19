"use strict";

/**
 * A student blocked only by the 6-hour post-logout cooldown
 * (User.lastLogoutTime, enforced by enforceLogoutRestriction) previously had
 * no admin unlock path at all: GET /api/hod/locked-students didn't list
 * them, PATCH /api/hod/unlock/:userId 404'd ("Locked student not found"),
 * POST /api/hod/bulk-unlock silently skipped them, and
 * POST /api/users/:id/unlock-account-device short-circuited with
 * "Account is not currently locked" without touching lastLogoutTime. An
 * HOD/admin who "unlocked" such a student saw a success response but the
 * cooldown remained in place. These tests cover the fix across all four
 * endpoints.
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
const { SIX_HOURS_MS } = require("../../src/middleware/deviceValidation");

const HOD_PASSWORD = randPassword();
const STUDENT_PASSWORD = randPassword();

let hodToken, companyId;

async function makeStudent(overrides = {}) {
  const student = await User.create({
    name: "Cooldown Student",
    email: `student${Date.now()}${Math.random().toString(36).slice(2)}@cooldown.edu`,
    password: STUDENT_PASSWORD,
    role: "student",
    company: companyId,
    isActive: true,
    isApproved: true,
    ...overrides,
  });
  return student;
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_logout_cooldown_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  const company = await Company.create({
    name: "Cooldown Academic Uni",
    mode: "academic",
    institutionCode: "COOLACAD1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  companyId = company._id;

  await User.create({
    name: "Cooldown HOD",
    email: "hod@cooldown.edu",
    password: HOD_PASSWORD,
    role: "hod",
    department: "CS",
    company: companyId,
    isActive: true,
    isApproved: true,
  });

  const hodLogin = await request(app).post("/api/auth/login")
    .send({ email: "hod@cooldown.edu", password: HOD_PASSWORD, loginRole: "hod" });
  expect(hodLogin.status).toBe(200);
  hodToken = hodLogin.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("post-logout cooldown visibility + unlock", () => {
  test("GET /api/hod/locked-students lists a cooldown-only student", async () => {
    const s = await makeStudent({ lastLogoutTime: new Date() });

    const res = await request(app)
      .get("/api/hod/locked-students")
      .set("Authorization", `Bearer ${hodToken}`);
    expect(res.status).toBe(200);
    expect(res.body.students.map(x => String(x._id))).toContain(String(s._id));
  });

  test("GET /api/hod/locked-students excludes a student with no lock at all", async () => {
    const s = await makeStudent();

    const res = await request(app)
      .get("/api/hod/locked-students")
      .set("Authorization", `Bearer ${hodToken}`);
    expect(res.status).toBe(200);
    expect(res.body.students.map(x => String(x._id))).not.toContain(String(s._id));
  });

  test("GET /api/hod/locked-students excludes a student whose cooldown already expired", async () => {
    const s = await makeStudent({ lastLogoutTime: new Date(Date.now() - SIX_HOURS_MS - 60000) });

    const res = await request(app)
      .get("/api/hod/locked-students")
      .set("Authorization", `Bearer ${hodToken}`);
    expect(res.status).toBe(200);
    expect(res.body.students.map(x => String(x._id))).not.toContain(String(s._id));
  });

  test("PATCH /api/hod/unlock/:userId clears a cooldown-only student (previously 404'd)", async () => {
    const s = await makeStudent({ lastLogoutTime: new Date() });

    const res = await request(app)
      .patch(`/api/hod/unlock/${s._id}`)
      .set("Authorization", `Bearer ${hodToken}`)
      .send({});
    expect(res.status).toBe(200);

    const fresh = await User.findById(s._id);
    expect(fresh.lastLogoutTime).toBeNull();
  });

  test("after unlock, the student no longer appears in locked-students", async () => {
    const s = await makeStudent({ lastLogoutTime: new Date() });

    await request(app)
      .patch(`/api/hod/unlock/${s._id}`)
      .set("Authorization", `Bearer ${hodToken}`)
      .send({});

    const res = await request(app)
      .get("/api/hod/locked-students")
      .set("Authorization", `Bearer ${hodToken}`);
    expect(res.body.students.map(x => String(x._id))).not.toContain(String(s._id));
  });

  test("POST /api/hod/bulk-unlock clears lastLogoutTime for a cooldown-only student", async () => {
    const s = await makeStudent({ lastLogoutTime: new Date() });

    const res = await request(app)
      .post("/api/hod/bulk-unlock")
      .set("Authorization", `Bearer ${hodToken}`)
      .send({ userIds: [String(s._id)] });
    expect(res.status).toBe(200);
    expect(res.body.unlockedCount).toBe(1);

    const fresh = await User.findById(s._id);
    expect(fresh.lastLogoutTime).toBeNull();
  });

  test("POST /api/users/:id/unlock-account-device clears a cooldown-only student instead of returning alreadyUnlocked", async () => {
    const s = await makeStudent({ lastLogoutTime: new Date() });

    const res = await request(app)
      .post(`/api/users/${s._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${hodToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.alreadyUnlocked).not.toBe(true);

    const fresh = await User.findById(s._id);
    expect(fresh.lastLogoutTime).toBeNull();
  });

  test("POST /api/users/:id/unlock-account-device still reports alreadyUnlocked for a student with no lock", async () => {
    const s = await makeStudent();

    const res = await request(app)
      .post(`/api/users/${s._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${hodToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.alreadyUnlocked).toBe(true);
  });

  test("device-locked student is still unlocked correctly (no regression)", async () => {
    const s = await makeStudent({
      accountDeviceLock: { isLocked: true, lockedUntil: new Date(Date.now() + SIX_HOURS_MS) },
    });

    const res = await request(app)
      .patch(`/api/hod/unlock/${s._id}`)
      .set("Authorization", `Bearer ${hodToken}`)
      .send({});
    expect(res.status).toBe(200);

    const fresh = await User.findById(s._id);
    expect(fresh.accountDeviceLock.isLocked).toBe(false);
  });
});
