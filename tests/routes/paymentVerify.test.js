"use strict";

/**
 * Regression coverage for the Phase 3 scalability fix in paymentController.js:
 * GET /api/payments/paystack/verify used to `await` the confirmation email
 * before responding, which could hold a paying user's screen for up to ~30s
 * on a Gmail/MailerSend timeout (see emailService.js) for an email whose
 * result the response never used. It's now fire-and-forget.
 *
 * axios (the real Paystack API call) and emailService are mocked -- both
 * are true externals, matching the repo's established convention (see
 * tests/routes/auth.test.js's emailService mock). Real MongoDB via
 * mongodb-memory-server / TEST_MONGO_URI, same as every other suite here.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-payverify-suite-0001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-payverify-suite-01";
process.env.NODE_ENV           = "test";
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_dummy_for_suite";

jest.mock("axios");

// Jest's module-factory hoisting only allows referencing out-of-scope
// identifiers whose name is prefixed "mock" (babel-plugin-jest-hoist) --
// hence the naming here, not just a style choice.
let mockEmailDelayMs = 0;
let mockEmailShouldReject = false;
const mockSendSubscriptionConfirmed = jest.fn(() =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      if (mockEmailShouldReject) reject(new Error("SMTP timeout"));
      else resolve({ ok: true });
    }, mockEmailDelayMs);
  })
);
jest.mock("../../src/services/emailService", () => ({
  sendSubscriptionConfirmed: (...args) => mockSendSubscriptionConfirmed(...args),
}));

const axios    = require("axios");
const request  = require("supertest");
const mongoose = require("mongoose");

let app;
let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");

const INSTITUTION_CODE = "PAYVERIFY1";
const PASSWORD = "PayVerifyPass!1";

let company, studentToken, student;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_payverify_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Pay Verify Test Co",
    mode: "academic",
    institutionCode: INSTITUTION_CODE,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  student = await User.create({
    name: "Pay Verify Student", email: "payverify@student.test", password: PASSWORD,
    role: "student", IndexNumber: "PV/CS/26/0001", company: company._id,
    isActive: true, isApproved: true,
  });

  const login = await request(app).post("/api/auth/login").send({ email: "payverify@student.test", password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  studentToken = login.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEmailDelayMs = 0;
  mockEmailShouldReject = false;
});

function mockPaystackSuccess(overrides = {}) {
  axios.get.mockResolvedValue({
    data: {
      data: {
        status: "success",
        amount: 2000, // student_semester default price is GHS 20 -> 2000 pesewas
        metadata: {
          purpose: "user_subscription",
          plan: "student_semester",
          userId: student._id.toString(),
        },
        ...overrides,
      },
    },
  });
}

describe("GET /api/payments/paystack/verify — email is fire-and-forget", () => {
  test("responds successfully without waiting on a slow confirmation email", async () => {
    mockPaystackSuccess();
    mockEmailDelayMs = 300; // would-be email latency the response must not wait on

    const start = Date.now();
    const res = await request(app)
      .get("/api/payments/paystack/verify")
      .query({ reference: "ref-fast-1" })
      .set("Authorization", `Bearer ${studentToken}`);
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/activated/i);
    // The whole point of the fix: the HTTP response must not be gated on
    // the 300ms mocked email latency above.
    expect(elapsedMs).toBeLessThan(250);
  });

  test("the confirmation email is still actually sent, just not awaited", async () => {
    mockPaystackSuccess();

    const res = await request(app)
      .get("/api/payments/paystack/verify")
      .query({ reference: "ref-sent-1" })
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50)); // let the un-awaited promise land
    expect(mockSendSubscriptionConfirmed).toHaveBeenCalledTimes(1);
    expect(mockSendSubscriptionConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ email: student.email, plan: "student_semester" })
    );
  });

  test("an email failure does not affect the success response", async () => {
    mockPaystackSuccess();
    mockEmailShouldReject = true;

    const res = await request(app)
      .get("/api/payments/paystack/verify")
      .query({ reference: "ref-fail-1" })
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.subscriptionExpiry).toBeTruthy();

    // Give the rejected promise a beat to be handled -- an unhandled
    // rejection here would fail the test suite even though the HTTP
    // response already succeeded, which is exactly the regression this
    // guards against.
    await new Promise((r) => setTimeout(r, 50));
  });
});
