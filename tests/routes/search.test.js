"use strict";

/**
 * Integration tests for GET /api/search — the staff-facing lookup used by
 * student-search.html (Students / Lecturers / All tabs). No test existed for
 * this route before; written to reproduce the reported bug ("Lecturers tab
 * returns nothing") against a real MongoDB rather than guessing at the cause.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-search-suite-000000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-search-suite-01";
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

let app;
let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");

const INSTITUTION_CODE = "SEARCHTEST1";
const OTHER_INSTITUTION_CODE = "SEARCHTEST2";
const LECTURER_EMAIL    = "searching.lecturer@searchtest.edu";
const LECTURER_PASSWORD = "LecturerPassw0rd!1";

let company, otherCompany, searchingLecturer, otherLecturer, student, crossTenantLecturer;
let accessToken;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_searchtest");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Search Test University",
    mode: "academic",
    institutionCode: INSTITUTION_CODE,
    selfRegistrationEnabled: true,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  otherCompany = await Company.create({
    name: "Search Test Other University",
    mode: "academic",
    institutionCode: OTHER_INSTITUTION_CODE,
    selfRegistrationEnabled: true,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  searchingLecturer = await User.create({
    name: "Prof. Searching Lecturer",
    email: LECTURER_EMAIL,
    password: LECTURER_PASSWORD,
    role: "lecturer",
    company: company._id,
    department: "Computer Science",
    isActive: true,
    isApproved: true,
  });

  otherLecturer = await User.create({
    name: "Dr. Nathaniel Mensah",
    email: "nathaniel.mensah@searchtest.edu",
    password: "SomePassw0rd!1",
    role: "lecturer",
    company: company._id,
    department: "Computer Science",
    isActive: true,
    isApproved: true,
  });

  student = await User.create({
    name: "Nathaniel Student",
    email: "nathaniel.student@searchtest.edu",
    password: "SomePassw0rd!1",
    role: "student",
    company: company._id,
    IndexNumber: "SEARCHTEST/CS/26/0001",
    isActive: true,
    isApproved: true,
  });

  // Same-name lecturer at a DIFFERENT company — must never leak into results.
  crossTenantLecturer = await User.create({
    name: "Nathaniel Cross Tenant",
    email: "nathaniel.crosstenant@othertest.edu",
    password: "SomePassw0rd!1",
    role: "lecturer",
    company: otherCompany._id,
    department: "Computer Science",
    isActive: true,
    isApproved: true,
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: LECTURER_EMAIL, password: LECTURER_PASSWORD, loginRole: "lecturer" });
  expect(login.status).toBe(200);
  accessToken = login.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("GET /api/search", () => {
  test("role=lecturer returns matching lecturers in the same company", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: "Nath", role: "lecturer" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.users.map((u) => u._id);
    expect(ids).toContain(String(otherLecturer._id));
    expect(ids).not.toContain(String(student._id));
    expect(ids).not.toContain(String(crossTenantLecturer._id));
  });

  test("role=student returns matching students only", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: "Nath", role: "student" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.users.map((u) => u._id);
    expect(ids).toContain(String(student._id));
    expect(ids).not.toContain(String(otherLecturer._id));
  });

  test("role=all (or omitted) returns both students and lecturers, still scoped to company", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: "Nath", role: "all" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.users.map((u) => u._id);
    expect(ids).toContain(String(student._id));
    expect(ids).toContain(String(otherLecturer._id));
    expect(ids).not.toContain(String(crossTenantLecturer._id));
  });

  test("excludes the searching user themself", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: "Searching", role: "lecturer" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.users.map((u) => u._id);
    expect(ids).not.toContain(String(searchingLecturer._id));
  });

  test("rejects queries shorter than 2 characters", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: "N" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });

  test("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/search").query({ q: "Nath" });
    expect(res.status).toBe(401);
  });
});
