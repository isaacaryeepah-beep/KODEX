"use strict";

/**
 * Integration tests for the academic GPS attendance settings endpoints
 * (GET/PATCH /api/attendance-sessions/campus-settings) — the campus
 * geofence defaults an academic admin configures, mirroring the corporate
 * clock-in settings. Admin-only; academic/both mode only.
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

const ADMIN_PASSWORD = randPassword();
const LECTURER_PASSWORD = randPassword();
const CORP_ADMIN_PASSWORD = randPassword();

let academicAdminToken, lecturerToken, corporateAdminToken;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_campus_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  const academic = await Company.create({
    name: "Campus Academic Uni",
    mode: "academic",
    institutionCode: "CAMPACAD1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  const corporate = await Company.create({
    name: "Campus Corporate Ltd",
    mode: "corporate",
    institutionCode: "CAMPCORP1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  await User.create({
    name: "Academic Admin", email: "admin@campacad.edu", password: ADMIN_PASSWORD,
    role: "admin", company: academic._id, isActive: true, isApproved: true,
  });
  await User.create({
    name: "Campus Lecturer", email: "lecturer@campacad.edu", password: LECTURER_PASSWORD,
    role: "lecturer", company: academic._id, department: "CS", isActive: true, isApproved: true,
  });
  await User.create({
    name: "Corporate Admin", email: "admin@campcorp.com", password: CORP_ADMIN_PASSWORD,
    role: "admin", company: corporate._id, isActive: true, isApproved: true,
  });

  const a = await request(app).post("/api/auth/login").send({ email: "admin@campacad.edu", password: ADMIN_PASSWORD });
  expect(a.status).toBe(200); academicAdminToken = a.body.token;
  const l = await request(app).post("/api/auth/login").send({ email: "lecturer@campacad.edu", password: LECTURER_PASSWORD, loginRole: "lecturer" });
  expect(l.status).toBe(200); lecturerToken = l.body.token;
  const c = await request(app).post("/api/auth/login").send({ email: "admin@campcorp.com", password: CORP_ADMIN_PASSWORD });
  expect(c.status).toBe(200); corporateAdminToken = c.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("GET/PATCH /api/attendance-sessions/campus-settings", () => {
  test("academic admin reads defaults (null center, 100m radius)", async () => {
    const res = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.campusLatitude).toBeNull();
    expect(res.body.campusLongitude).toBeNull();
    expect(res.body.defaultGeofenceRadiusMeters).toBe(100);
    expect(res.body.requireEsp32Attendance).toBe(false);
  });

  test("academic admin saves a campus center + radius, and it reads back", async () => {
    const patch = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ campusLatitude: 5.6037, campusLongitude: -0.187, defaultGeofenceRadiusMeters: 200, requireEsp32Attendance: true });
    expect(patch.status).toBe(200);

    const get = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(get.body.campusLatitude).toBeCloseTo(5.6037, 4);
    expect(get.body.campusLongitude).toBeCloseTo(-0.187, 4);
    expect(get.body.defaultGeofenceRadiusMeters).toBe(200);
    expect(get.body.requireEsp32Attendance).toBe(true);
  });

  test("clearing the campus center (null lat/lng) is allowed", async () => {
    const patch = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ campusLatitude: null, campusLongitude: null });
    expect(patch.status).toBe(200);
    const get = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(get.body.campusLatitude).toBeNull();
  });

  test("rejects an out-of-range latitude", async () => {
    const res = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ campusLatitude: 200, campusLongitude: 10 });
    expect(res.status).toBe(400);
  });

  test("rejects a radius below the 20m floor", async () => {
    const res = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ defaultGeofenceRadiusMeters: 5 });
    expect(res.status).toBe(400);
  });

  test("saves campus WiFi IPs as an array, and they read back", async () => {
    const patch = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ allowedWifiIPs: ["197.251.144.12", " 41.66.200.5 ", ""] });
    expect(patch.status).toBe(200);

    const get = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(get.body.allowedWifiIPs).toEqual(["197.251.144.12", "41.66.200.5"]);
  });

  test("accepts campus WiFi IPs as the comma-separated string the settings form sends", async () => {
    const patch = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ allowedWifiIPs: " 10.10.1.1, 10.10.1.2 ,, " });
    expect(patch.status).toBe(200);

    const get = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(get.body.allowedWifiIPs).toEqual(["10.10.1.1", "10.10.1.2"]);
  });

  test("clearing campus WiFi IPs with an empty string empties the list", async () => {
    const patch = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ allowedWifiIPs: "" });
    expect(patch.status).toBe(200);

    const get = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(get.body.allowedWifiIPs).toEqual([]);
  });

  test("caps the campus WiFi IP list at 20 entries", async () => {
    const many = Array.from({ length: 25 }, (_, i) => `10.0.0.${i + 1}`);
    const patch = await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ allowedWifiIPs: many });
    expect(patch.status).toBe(200);

    const get = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`);
    expect(get.body.allowedWifiIPs.length).toBe(20);
    // Reset so this suite leaves clean state for any later additions.
    await request(app)
      .patch("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${academicAdminToken}`)
      .send({ allowedWifiIPs: [] });
  });

  test("a non-admin (lecturer) is rejected", async () => {
    const res = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(res.status).toBe(403);
  });

  test("a corporate admin is rejected (academic feature)", async () => {
    const res = await request(app)
      .get("/api/attendance-sessions/campus-settings")
      .set("Authorization", `Bearer ${corporateAdminToken}`);
    expect(res.status).toBe(400);
  });
});
