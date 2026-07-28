"use strict";

/**
 * Integration tests for POST /api/ussd/callback (controllers/ussdController.js)
 * — real Express app, real MongoDB. Drives the actual Arkesel-style USSD
 * request/response contract (sessionId/phoneNumber/text/type in, plain
 * "CON "/"END " text out) end-to-end, asserting on the real
 * CorporateAttendance/LeaveBalance documents it produces.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-ussd-suite-00000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-ussd-suite-000001";
process.env.USSD_WEBHOOK_TOKEN = process.env.USSD_WEBHOOK_TOKEN || "test-ussd-webhook-token-0000000001";
process.env.NODE_ENV           = "test";

const request  = require("supertest");
const mongoose = require("mongoose");

let app;
let memoryServer = null;

const Company           = require("../../src/models/Company");
const User              = require("../../src/models/User");
const CorporateAttendance = require("../../src/models/CorporateAttendance");
const Shift              = require("../../src/models/Shift");
const ShiftAssignment    = require("../../src/models/ShiftAssignment");
const LeavePolicy        = require("../../src/models/LeavePolicy");
const LeaveBalance       = require("../../src/models/LeaveBalance");
const { normalisePhone } = require("../../src/services/smsService");

const TOKEN = process.env.USSD_WEBHOOK_TOKEN;
const PHONE_RAW = "0241234567";
const PHONE_USSD = "+233241234567"; // what the aggregator sends
const PIN = "7734";

let company, employee;

function ussd(body) {
  return request(app).post(`/api/ussd/callback?token=${TOKEN}`).send(body);
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_ussd_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "corporateattendances", "shifts", "shiftassignments", "leavepolicies", "leavebalances"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "USSD Test Co",
    mode: "corporate",
    subscriptionStatus: "trial",
    trialEndDate: new Date(Date.now() + 188 * 24 * 60 * 60 * 1000),
  });

  employee = await User.create({
    name: "USSD Test Employee", email: "ussd.employee@dikly-test.local", password: "Passw0rd!123",
    role: "employee", company: company._id, phone: normalisePhone(PHONE_RAW),
    isActive: true, isApproved: true,
  });

  const shift = await Shift.create({
    company: company._id, name: "Day Shift", startTime: "09:00", endTime: "17:00",
    gracePeriodMinutes: 15, createdBy: employee._id,
  });
  await ShiftAssignment.create({
    company: company._id, employee: employee._id, shift: shift._id, isActive: true,
    startDate: new Date(Date.now() - 30 * 86400000), assignedBy: employee._id,
  });

  const policy = await LeavePolicy.create({
    company: company._id, name: "Annual Leave", code: "AL", daysPerYear: 21, accrualType: "annual",
  });
  await LeaveBalance.create({
    company: company._id, employee: employee._id, policy: policy._id, year: new Date().getFullYear(),
    entitlement: 21, used: 6,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

afterEach(async () => {
  await CorporateAttendance.deleteMany({ employee: employee._id });
});

describe("POST /api/ussd/callback — auth", () => {
  test("rejects a missing/wrong webhook token", async () => {
    const res = await request(app)
      .post("/api/ussd/callback?token=wrong")
      .send({ phoneNumber: PHONE_USSD, text: "", type: "initiation" });
    expect(res.status).toBe(401);
    expect(res.text).toMatch(/^END/);
  });
});

describe("POST /api/ussd/callback — identity", () => {
  test("unregistered phone number gets a clear END message", async () => {
    const res = await ussd({ phoneNumber: "+233209990000", text: "", type: "initiation" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/not registered/i);
  });

  test("initiation shows the welcome menu", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: "", type: "initiation" });
    expect(res.text).toMatch(/^CON/);
    expect(res.text).toMatch(/Clock In/);
    expect(res.text).toMatch(/Clock Out/);
    expect(res.text).toMatch(/Leave Balance/);
  });
});

describe("POST /api/ussd/callback — clock-in, no PIN set yet", () => {
  test("tells the employee to set a PIN first", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: "1", type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/set a 4-digit/i);
  });
});

describe("POST /api/ussd/callback — clock-in flow (PIN set)", () => {
  beforeAll(async () => {
    const login = await request(app).post("/api/auth/login").send({ email: employee.email, password: "Passw0rd!123" });
    await request(app)
      .post("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ pin: PIN });
  });

  test("picking Clock In prompts for the PIN", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: "1", type: "response" });
    expect(res.text).toMatch(/^CON/);
    expect(res.text).toMatch(/PIN/i);
  });

  test("wrong PIN once re-prompts, wrong PIN twice cancels", async () => {
    const first = await ussd({ phoneNumber: PHONE_USSD, text: "1*0000", type: "response" });
    expect(first.text).toMatch(/^CON/);
    expect(first.text).toMatch(/incorrect/i);

    const second = await ussd({ phoneNumber: PHONE_USSD, text: "1*0000*1111", type: "response" });
    expect(second.text).toMatch(/^END/);
    expect(second.text).toMatch(/incorrect/i);

    const record = await CorporateAttendance.findOne({ employee: employee._id });
    expect(record).toBeNull();
  });

  test("correct PIN clocks in and writes a real record with method 'ussd'", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: `1*${PIN}`, type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/clocked in/i);

    const record = await CorporateAttendance.findOne({ employee: employee._id });
    expect(record).toBeTruthy();
    expect(record.clockIn.method).toBe("ussd");
    expect(record.clockIn.time).toBeTruthy();
    expect(record.clockIn.location.latitude).toBeNull();
  });

  test("double clock-in is blocked", async () => {
    await ussd({ phoneNumber: PHONE_USSD, text: `1*${PIN}`, type: "response" });
    const res = await ussd({ phoneNumber: PHONE_USSD, text: `1*${PIN}`, type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/already clocked in/i);
  });
});

describe("POST /api/ussd/callback — clock-out flow", () => {
  test("clock-out with no clock-in record is refused", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: `2*${PIN}`, type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/no clock-in record/i);
  });

  test("clock-out immediately after clock-in hits the minimum-interval guard", async () => {
    await ussd({ phoneNumber: PHONE_USSD, text: `1*${PIN}`, type: "response" });
    const res = await ussd({ phoneNumber: PHONE_USSD, text: `2*${PIN}`, type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/too soon/i);
  });
});

describe("POST /api/ussd/callback — read-only checks (no PIN needed)", () => {
  test("leave balance shows the real seeded balance", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: "3", type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/Annual Leave/);
    expect(res.text).toMatch(/15d left/); // 21 entitlement - 6 used
  });

  test("today's status reflects a real clock-in", async () => {
    await ussd({ phoneNumber: PHONE_USSD, text: `1*${PIN}`, type: "response" });
    const res = await ussd({ phoneNumber: PHONE_USSD, text: "4", type: "response" });
    expect(res.text).toMatch(/^END/);
    expect(res.text).toMatch(/not yet clocked out/i);
  });

  test("today's status when not clocked in", async () => {
    const res = await ussd({ phoneNumber: PHONE_USSD, text: "4", type: "response" });
    expect(res.text).toMatch(/^END Not clocked in today\./);
  });
});
