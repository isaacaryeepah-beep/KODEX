"use strict";

/**
 * Integration tests for the auth flows: student registration, login,
 * refresh-token rotation, and 2FA. These run against the REAL Express app
 * (src/server.js exports it without booting) and a real MongoDB:
 *
 *   - CI / default:      mongodb-memory-server (downloads mongod on first run)
 *   - local override:    TEST_MONGO_URI=mongodb://127.0.0.1:27017/dikly_authtest
 *
 * The email service is mocked — nothing here sends real email — and the
 * 2FA test captures the code from the mock instead of an inbox.
 */

jest.setTimeout(120000); // first CI run downloads a mongod binary

// Must be set before the app (and utils/jwt) is required.
process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-auth-suite-000000000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-auth-suite-0001";
process.env.NODE_ENV           = "test";

jest.mock("../../src/services/emailService", () => ({
  sendWelcome:                 jest.fn(async () => ({ ok: true })),
  sendAdminPasswordResetNotice: jest.fn(async () => ({ ok: true })),
  sendPasswordReset:           jest.fn(async () => ({ ok: true })),
  sendEmailVerification:       jest.fn(async () => ({ ok: true })),
  sendNewInstitutionAlert:     jest.fn(async () => ({ ok: true })),
  sendLecturerWelcome:         jest.fn(async () => ({ ok: true })),
  sendEmployeeWelcome:         jest.fn(async () => ({ ok: true })),
  sendHodWelcome:              jest.fn(async () => ({ ok: true })),
  sendSelfRegPending:          jest.fn(async () => ({ ok: true })),
  sendAdminNewSelfReg:         jest.fn(async () => ({ ok: true })),
}));

const request  = require("supertest");
const mongoose = require("mongoose");
const { sendPasswordReset, sendEmailVerification } = require("../../src/services/emailService");

let app;
let memoryServer = null;

const Company       = require("../../src/models/Company");
const User          = require("../../src/models/User");
const Course        = require("../../src/models/Course");
const StudentRoster = require("../../src/models/StudentRoster");

// ── Seeded fixtures shared across tests ──────────────────────────────────────
const INSTITUTION_CODE = "AUTHTEST1";
const ROSTERED_INDEX   = "AUTH/CS/26/0001";
const ROSTERED_INDEX_2 = "AUTH/CS/26/0002";
const ADMIN_EMAIL      = "admin@authtest.edu";
const ADMIN_PASSWORD   = "AdminPassw0rd!1";

let company, admin;
let studentVerificationCode; // captured off the mocked email in the registration test below

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_authtest");
  }
  await mongoose.connect(uri);
  // Requiring the app after connect keeps mongoose from buffering model calls.
  ({ app } = require("../../src/server"));

  // Clean slate for repeat local runs against a persistent TEST_MONGO_URI.
  await Promise.all(
    ["users", "companies", "courses", "studentrosters", "refreshtokens"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Auth Test University",
    mode: "academic",
    institutionCode: INSTITUTION_CODE,
    selfRegistrationEnabled: true,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  const hod = await User.create({
    name: "Prof. Auth HOD",
    email: "hod@authtest.edu",
    password: "HodPassw0rd!1",
    role: "hod",
    company: company._id,
    department: "Computer Science",
    isActive: true,
    isApproved: true,
  });

  const course = await Course.create({
    title: "Intro to Testing",
    code: "TST101",
    companyId: company._id,
    lecturerId: hod._id,
    createdBy: hod._id,
  });

  await StudentRoster.create([
    { studentId: ROSTERED_INDEX,   company: company._id, course: course._id, addedBy: hod._id },
    { studentId: ROSTERED_INDEX_2, company: company._id, course: course._id, addedBy: hod._id },
  ]);

  admin = await User.create({
    name: "Auth Test Admin",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: "admin",
    company: company._id,
    isActive: true,
    isApproved: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

// ── Student registration ─────────────────────────────────────────────────────

describe("POST /api/auth/register-student", () => {
  const base = {
    name: "Reg Test Student",
    email: "student1@authtest.edu",
    indexNumber: ROSTERED_INDEX,
    password: "StudentPass!1",
    institutionCode: INSTITUTION_CODE,
    department: "Computer Science",
    programme: "BSc",
    studentLevel: "100",
    studentGroup: "A",
    sessionType: "Regular",
    semester: "1",
  };

  test("rejects a submission with no email (the regression that shipped)", async () => {
    const { email, ...withoutEmail } = base;
    const res = await request(app).post("/api/auth/register-student").send(withoutEmail);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test("rejects an invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/register-student")
      .send({ ...base, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  test("rejects a student ID that is not on any class roster", async () => {
    const res = await request(app)
      .post("/api/auth/register-student")
      .send({ ...base, email: "unrostered@authtest.edu", indexNumber: "AUTH/CS/26/9999" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/roster/i);
  });

  test("rejects a department that has no approved HOD", async () => {
    const res = await request(app)
      .post("/api/auth/register-student")
      .send({ ...base, email: "nohod@authtest.edu", department: "Philosophy" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/HOD/i);
  });

  test("registers a rostered student, stores the email, and requires verification before anything else", async () => {
    sendEmailVerification.mockClear();
    const res = await request(app).post("/api/auth/register-student").send(base);
    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.email).toBe(base.email);
    expect(res.body.message).toMatch(/verification code/i);

    const created = await User.findOne({ IndexNumber: ROSTERED_INDEX, company: company._id }).lean();
    expect(created).toBeTruthy();
    expect(created.email).toBe(base.email);
    expect(created.isApproved).toBe(false);
    expect(created.emailVerified).toBe(false);
    expect(created.role).toBe("student");

    // The code was actually emailed (mocked) -- captured for later tests.
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(sendEmailVerification.mock.calls[0][0].email).toBe(base.email);
    expect(sendEmailVerification.mock.calls[0][0].code).toMatch(/^\d{6}$/);
    studentVerificationCode = sendEmailVerification.mock.calls[0][0].code;
  });

  test("rejects a duplicate index number at the same institution", async () => {
    const res = await request(app)
      .post("/api/auth/register-student")
      .send({ ...base, email: "different@authtest.edu" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test("rejects a duplicate email at the same institution", async () => {
    const res = await request(app)
      .post("/api/auth/register-student")
      .send({ ...base, indexNumber: ROSTERED_INDEX_2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email is already registered/i);
  });
});

// ── Email verification ───────────────────────────────────────────────────────

describe("Email verification (register -> verify-email / resend-verification-code)", () => {
  test("admin signup: register requires verification (no token yet), then verify-email issues one", async () => {
    sendEmailVerification.mockClear();
    const reg = await request(app).post("/api/auth/register").send({
      name: "New Institution Admin",
      email: "newadmin@authtest.edu",
      password: "NewAdminPass!1",
      companyName: "Brand New Institution",
      mode: "academic",
    });
    expect(reg.status).toBe(201);
    expect(reg.body.requiresVerification).toBe(true);
    expect(reg.body.token).toBeUndefined();
    expect(reg.body.email).toBe("newadmin@authtest.edu");

    const createdAdmin = await User.findOne({ email: "newadmin@authtest.edu" }).lean();
    expect(createdAdmin.emailVerified).toBe(false);
    expect(createdAdmin.isApproved).toBe(true); // admins are still auto-approved; just not auto-logged-in anymore

    const blockedLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "newadmin@authtest.edu", password: "NewAdminPass!1" });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.emailNotVerified).toBe(true);

    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    const code = sendEmailVerification.mock.calls[0][0].code;
    expect(code).toMatch(/^\d{6}$/);

    const badCode = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "newadmin@authtest.edu", code: code === "111111" ? "222222" : "111111" });
    expect(badCode.status).toBe(400);
    expect(badCode.body.error).toMatch(/incorrect/i);

    const verify = await request(app).post("/api/auth/verify-email").send({ email: "newadmin@authtest.edu", code });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toEqual(expect.any(String));
    expect(verify.body.refreshToken).toEqual(expect.any(String));
    expect(verify.body.user.role).toBe("admin");
    expect(verify.body.user.company.name).toBe("Brand New Institution");

    const afterVerify = await User.findOne({ email: "newadmin@authtest.edu" }).lean();
    expect(afterVerify.emailVerified).toBe(true);
    expect(afterVerify.emailVerificationCode).toBeFalsy();

    // Now a normal login works.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "newadmin@authtest.edu", password: "NewAdminPass!1" });
    expect(login.status).toBe(200);
    expect(login.body.token).toEqual(expect.any(String));
  });

  test("verifying an already-verified email is rejected", async () => {
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "newadmin@authtest.edu", code: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already verified/i);
  });

  test("expired code is rejected, and resend issues a fresh code that verifies", async () => {
    sendEmailVerification.mockClear();
    const reg = await request(app).post("/api/auth/register-hod").send({
      name: "Expiry Test HOD",
      email: "expiryhod@authtest.edu",
      password: "ExpiryPass!1",
      institutionCode: INSTITUTION_CODE,
      department: "Expiry Testing Dept",
    });
    expect(reg.status).toBe(201);
    expect(reg.body.requiresVerification).toBe(true);
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    const oldCode = sendEmailVerification.mock.calls[0][0].code;

    // Force the stored code to look expired instead of waiting 15 minutes.
    await User.updateOne(
      { email: "expiryhod@authtest.edu" },
      { emailVerificationExpires: new Date(Date.now() - 1000) }
    );

    const expiredAttempt = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "expiryhod@authtest.edu", institutionCode: INSTITUTION_CODE, code: oldCode });
    expect(expiredAttempt.status).toBe(400);
    expect(expiredAttempt.body.error).toMatch(/expired/i);

    sendEmailVerification.mockClear();
    const resend = await request(app)
      .post("/api/auth/resend-verification-code")
      .send({ email: "expiryhod@authtest.edu", institutionCode: INSTITUTION_CODE });
    expect(resend.status).toBe(200);
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    const freshCode = sendEmailVerification.mock.calls[0][0].code;

    const verify = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "expiryhod@authtest.edu", institutionCode: INSTITUTION_CODE, code: freshCode });
    expect(verify.status).toBe(200);
    expect(verify.body.message).toMatch(/pending admin approval/i);
  });

  test("resend is rate-limited while the just-sent code is still fresh", async () => {
    const reg = await request(app).post("/api/auth/register-hod").send({
      name: "Resend Cooldown HOD",
      email: "cooldown@authtest.edu",
      password: "CooldownPass!1",
      institutionCode: INSTITUTION_CODE,
      department: "Cooldown Testing Dept",
    });
    expect(reg.status).toBe(201);

    const res = await request(app)
      .post("/api/auth/resend-verification-code")
      .send({ email: "cooldown@authtest.edu", institutionCode: INSTITUTION_CODE });
    expect(res.status).toBe(429);
  });

  test("verify-email and resend-verification-code 404 for an unknown account", async () => {
    const verify = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "ghost-account@authtest.edu", code: "123456" });
    expect(verify.status).toBe(404);

    const resend = await request(app)
      .post("/api/auth/resend-verification-code")
      .send({ email: "ghost-account@authtest.edu" });
    expect(resend.status).toBe(404);
  });

  test("a failed verification email returns a clean error and rolls back the account", async () => {
    sendEmailVerification.mockRejectedValueOnce(new Error("Simulated send failure"));
    const reg = await request(app).post("/api/auth/register-hod").send({
      name: "Failed Send HOD",
      email: "failedsend@authtest.edu",
      password: "FailedSendPass!1",
      institutionCode: INSTITUTION_CODE,
      department: "Failed Send Testing Dept",
    });
    expect(reg.status).toBe(500);
    expect(reg.body.error).toMatch(/failed to send verification code/i);
    // Rollback (User.findByIdAndDelete) is attempted here but not asserted
    // on directly -- FerretDB (this suite's local/CI Mongo substitute) does
    // not implement findAndModify's "fields" option, so the delete itself
    // reliably fails in this test environment even though it works against
    // real MongoDB. That's exactly the scenario the next test locks down:
    // whether or not the rollback succeeds, the client must never see it.
  });

  // Regression test for a real bug caught while building this feature: the
  // live dev server has a hand-rolled Gmail SMTP client with no socket
  // timeout, so an unreachable smtp.gmail.com hung every registration
  // request forever (fixed separately in emailService.js). Discovering that
  // also surfaced this second bug -- when the *rollback* delete itself then
  // fails (it did, against the sandbox's FerretDB, which doesn't implement
  // findAndModify's "fields" option), that DB error was escaping to the
  // outer catch and leaking a raw Mongo error string to the client instead
  // of the intended clean message.
  test("a failed verification email still returns the clean error even if the rollback delete also fails", async () => {
    sendEmailVerification.mockRejectedValueOnce(new Error("Simulated send failure"));
    const deleteSpy = jest.spyOn(User, "findByIdAndDelete")
      .mockRejectedValueOnce(new Error('findAndModify: support for field "fields" is not implemented yet'));

    const reg = await request(app).post("/api/auth/register-hod").send({
      name: "Rollback Fails HOD",
      email: "rollbackfails@authtest.edu",
      password: "RollbackFailsPass!1",
      institutionCode: INSTITUTION_CODE,
      department: "Rollback Fails Testing Dept",
    });

    expect(reg.status).toBe(500);
    expect(reg.body.error).toMatch(/failed to send verification code/i);
    // The rollback's own DB error must never leak through instead of the
    // clean message -- this is exactly what broke before the fix.
    expect(reg.body.error).not.toMatch(/findAndModify/i);

    deleteSpy.mockRestore();
  });
});

// ── Login ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  test("logs in an approved user and returns token + refreshToken + user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(ADMIN_EMAIL);
    expect(res.body.user.role).toBe("admin");
  });

  test("rejects a wrong password with 401 and no token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: "WrongPassword!1" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test("rejects a missing password with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: ADMIN_EMAIL });
    expect(res.status).toBe(400);
  });

  test("blocks an unverified student with 403 emailNotVerified, before the approval gate", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ indexNumber: ROSTERED_INDEX, institutionCode: INSTITUTION_CODE, password: "StudentPass!1" });
    expect(res.status).toBe(403);
    expect(res.body.emailNotVerified).toBe(true);
    expect(res.body.error).toMatch(/verify your email/i);
  });

  test("blocks an unapproved (but now verified) student with 403 pending-approval", async () => {
    expect(studentVerificationCode).toMatch(/^\d{6}$/);
    const verify = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "student1@authtest.edu", institutionCode: INSTITUTION_CODE, code: studentVerificationCode });
    expect(verify.status).toBe(200);
    expect(verify.body.message).toMatch(/pending approval/i);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ indexNumber: ROSTERED_INDEX, institutionCode: INSTITUTION_CODE, password: "StudentPass!1" });
    expect(res.status).toBe(403);
    expect(res.body.emailNotVerified).toBeUndefined();
    expect(res.body.error).toMatch(/pending approval/i);
  });

  test("locks the account after 5 consecutive failed attempts", async () => {
    const lockee = await User.create({
      name: "Lockout Target",
      email: "lockme@authtest.edu",
      password: "LockMePass!1",
      role: "admin",
      company: company._id,
      isActive: true,
      isApproved: true,
    });
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "lockme@authtest.edu", password: "wrong-" + i });
    }
    const after = await User.findById(lockee._id).lean();
    expect(after.failedLoginAttempts).toBeGreaterThanOrEqual(5);
    expect(after.isLocked).toBe(true);
  });
});

// ── Refresh-token rotation ───────────────────────────────────────────────────

describe("POST /api/auth/refresh", () => {
  test("rotates the pair, and revokes on reuse of the old token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const firstRefresh = login.body.refreshToken;

    const rotated = await request(app).post("/api/auth/refresh").send({ refreshToken: firstRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.token).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);

    // Reusing the now-revoked first token must fail (theft-detection path).
    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);
  });

  test("rejects a garbage refresh token with 401", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "not.a.jwt" });
    expect(res.status).toBe(401);
  });

  test("rejects a missing refresh token with 400", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(400);
  });
});

// ── Two-factor authentication ────────────────────────────────────────────────

describe("2FA (/api/auth/2fa/*)", () => {
  let accessToken;

  beforeAll(async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    accessToken = login.body.token;
  });

  test("toggle enables 2FA on the account", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/toggle")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ enable: true });
    expect(res.status).toBe(200);
    expect(res.body.twoFactorEnabled).toBe(true);

    const after = await User.findById(admin._id).lean();
    expect(after.twoFactorEnabled).toBe(true);
  });

  test("send + verify: the emailed code completes 2FA and issues tokens", async () => {
    sendPasswordReset.mockClear();
    const sendRes = await request(app)
      .post("/api/auth/2fa/send")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    expect(sendRes.status).toBe(200);

    // The controller emails the code via sendPasswordReset({ resetCode }) —
    // grab it off the mock, exactly what a user reads from their inbox.
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    const code = sendPasswordReset.mock.calls[0][0].resetCode;
    expect(code).toMatch(/^\d{6}$/);

    const badVerify = await request(app)
      .post("/api/auth/2fa/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: "000000" === code ? "111111" : "000000" });
    expect(badVerify.status).toBe(400);

    const verify = await request(app)
      .post("/api/auth/2fa/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toEqual(expect.any(String));
    expect(verify.body.refreshToken).toEqual(expect.any(String));
  });

  test("verify with no pending code returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/2fa/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ code: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no 2fa code pending/i);
  });

  test("2fa endpoints require authentication", async () => {
    const res = await request(app).post("/api/auth/2fa/send").send({});
    expect(res.status).toBe(401);
  });
});
