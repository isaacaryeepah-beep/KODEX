"use strict";

/**
 * Verifies the Redis caching wired into dashboardController.js (Phase 2
 * scalability work): each dashboard endpoint must call getOrSetCache with
 * the expected cache key/TTL, and the clock-in/clock-out routes must
 * invalidate the employee dashboard's cache key on write so a refresh right
 * after clocking in never shows stale "not clocked in" data.
 *
 * cacheService is mocked at the module boundary (same convention as
 * tests/routes/auth.test.js's emailService mock) so no real Redis is
 * needed -- the mock's getOrSetCache just calls straight through to the
 * fetch function, so the real Mongo-backed dashboard logic still runs and
 * is asserted on for real; only the caching wrapper itself is a test
 * double, since that's the new logic this suite is here to verify.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-dashcache-suite-0001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-dashcache-suite-001";
process.env.NODE_ENV           = "test";

jest.mock("../../src/services/cacheService", () => ({
  getOrSetCache: jest.fn((key, ttl, fetchFn) => fetchFn()),
  invalidateCache: jest.fn(async () => {}),
  invalidatePattern: jest.fn(async () => {}),
  isEnabled: jest.fn(() => false),
}));

jest.mock("../../src/services/emailService", () => ({
  sendWelcome: jest.fn(async () => ({ ok: true })),
  sendEmailVerification: jest.fn(async () => ({ ok: true })),
}));

const request  = require("supertest");
const mongoose = require("mongoose");
const { getOrSetCache, invalidateCache } = require("../../src/services/cacheService");

let app;
let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");

const INSTITUTION_CODE = "DASHCACHE1";
const PASSWORD = "DashCachePass!1";

let company, adminToken, lecturerToken, studentToken, employeeToken, employeeUser;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_dashcache_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Dash Cache Test Co",
    // "both" so this one company satisfies requireMode("corporate") (needed
    // by the clock-in test below) as well as the academic dashboard tests --
    // dashboard routes themselves have no mode gate (see dashboard.js).
    mode: "both",
    institutionCode: INSTITUTION_CODE,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  await User.create({
    name: "Dash Admin", email: "dashadmin@cache.test", password: PASSWORD,
    role: "admin", company: company._id, isActive: true, isApproved: true,
  });
  await User.create({
    name: "Dash Lecturer", email: "dashlecturer@cache.test", password: PASSWORD,
    role: "lecturer", company: company._id, department: "CS", isActive: true, isApproved: true,
  });
  await User.create({
    name: "Dash Student", email: "dashstudent@cache.test", password: PASSWORD,
    role: "student", IndexNumber: "DC/CS/26/0001", company: company._id, isActive: true, isApproved: true,
  });
  employeeUser = await User.create({
    name: "Dash Employee", email: "dashemployee@cache.test", password: PASSWORD,
    role: "employee", company: company._id, isActive: true, isApproved: true,
  });

  const login = async (email) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.token;
  };

  adminToken    = await login("dashadmin@cache.test");
  lecturerToken = await login("dashlecturer@cache.test");
  studentToken  = await login("dashstudent@cache.test");
  employeeToken = await login("dashemployee@cache.test");
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

beforeEach(() => {
  getOrSetCache.mockClear();
  invalidateCache.mockClear();
});

describe("dashboard endpoints — cache wiring", () => {
  test("GET /api/dashboard/academic caches under dash:academic:<company>, TTL 30", async () => {
    const res = await request(app)
      .get("/api/dashboard/academic")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(getOrSetCache).toHaveBeenCalledWith(
      `dash:academic:${company._id}`, 30, expect.any(Function)
    );
  });

  test("GET /api/dashboard/corporate caches under dash:corporate:<company>, TTL 30", async () => {
    const res = await request(app)
      .get("/api/dashboard/corporate")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(getOrSetCache).toHaveBeenCalledWith(
      `dash:corporate:${company._id}`, 30, expect.any(Function)
    );
  });

  test("GET /api/dashboard/lecturer caches under dash:lecturer:<company>:<userId>, TTL 30", async () => {
    const res = await request(app)
      .get("/api/dashboard/lecturer")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(res.status).toBe(200);
    const [key, ttl] = getOrSetCache.mock.calls[0];
    expect(key).toMatch(new RegExp(`^dash:lecturer:${company._id}:`));
    expect(ttl).toBe(30);
  });

  test("GET /api/dashboard/student caches under dash:student:<company>:<userId>, TTL 30", async () => {
    const res = await request(app)
      .get("/api/dashboard/student")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const [key, ttl] = getOrSetCache.mock.calls[0];
    expect(key).toMatch(new RegExp(`^dash:student:${company._id}:`));
    expect(ttl).toBe(30);
  });

  test("GET /api/dashboard/employee caches under dash:employee:<company>:<userId>, short TTL", async () => {
    const res = await request(app)
      .get("/api/dashboard/employee")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(getOrSetCache).toHaveBeenCalledWith(
      `dash:employee:${company._id}:${employeeUser._id}`, 10, expect.any(Function)
    );
  });
});

describe("clock-in/clock-out — employee dashboard cache invalidation", () => {
  test("a successful clock-in invalidates dash:employee:<company>:<userId>", async () => {
    const res = await request(app)
      .post("/api/corporate-attendance/clock-in")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ method: "web" });

    expect(res.status).toBe(200);
    expect(invalidateCache).toHaveBeenCalledWith(`dash:employee:${company._id}:${employeeUser._id}`);
  });
});
