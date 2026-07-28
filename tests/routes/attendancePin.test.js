"use strict";

/**
 * Integration tests for POST/DELETE /api/auth/attendance-pin
 * (authController.setAttendancePin / clearAttendancePin) — real Express
 * app, real MongoDB. This is the missing piece that makes the previously
 * dead `attendancePin` field on User.js actually settable: it's the second
 * factor USSD clock-in (controllers/ussdController.js) checks against.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-pin-suite-0000000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-pin-suite-00000001";
process.env.NODE_ENV           = "test";

const request  = require("supertest");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

let app;
let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");

let company, employee, employeeToken, admin, adminToken;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_attendancepin_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Attendance PIN Test Co",
    mode: "corporate",
    subscriptionStatus: "trial",
    trialEndDate: new Date(Date.now() + 188 * 24 * 60 * 60 * 1000),
  });

  employee = await User.create({
    name: "PIN Test Employee", email: "pintest.employee@dikly-test.local", password: "Passw0rd!123",
    role: "employee", company: company._id, isActive: true, isApproved: true,
  });
  admin = await User.create({
    name: "PIN Test Admin", email: "pintest.admin@dikly-test.local", password: "Passw0rd!123",
    role: "admin", company: company._id, isActive: true, isApproved: true,
  });

  const empLogin = await request(app).post("/api/auth/login").send({ email: employee.email, password: "Passw0rd!123" });
  employeeToken = empLogin.body.token;

  const adminLogin = await request(app).post("/api/auth/login").send({ email: admin.email, password: "Passw0rd!123" });
  adminToken = adminLogin.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe("POST /api/auth/attendance-pin", () => {
  test("employee can set a valid 4-digit PIN, stored as a bcrypt hash", async () => {
    const res = await request(app)
      .post("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ pin: "4821" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const stored = await User.findById(employee._id).select("+attendancePin").lean();
    expect(stored.attendancePin).toBeTruthy();
    expect(stored.attendancePin).not.toBe("4821");
    await expect(bcrypt.compare("4821", stored.attendancePin)).resolves.toBe(true);
  });

  test("rejects a non-4-digit PIN", async () => {
    const res = await request(app)
      .post("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ pin: "123" });
    expect(res.status).toBe(400);
  });

  test("rejects a non-numeric PIN", async () => {
    const res = await request(app)
      .post("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ pin: "abcd" });
    expect(res.status).toBe(400);
  });

  test("non-employee roles cannot set an attendance PIN", async () => {
    const res = await request(app)
      .post("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pin: "1234" });
    expect(res.status).toBe(403);
  });

  test("requires authentication", async () => {
    const res = await request(app).post("/api/auth/attendance-pin").send({ pin: "1234" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/auth/attendance-pin", () => {
  test("employee can clear their PIN", async () => {
    await request(app)
      .post("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ pin: "9911" });

    const res = await request(app)
      .delete("/api/auth/attendance-pin")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);

    const stored = await User.findById(employee._id).select("+attendancePin").lean();
    expect(stored.attendancePin).toBeFalsy();
  });
});
