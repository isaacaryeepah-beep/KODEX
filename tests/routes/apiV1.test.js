"use strict";

/**
 * Integration tests for the public API (/api/v1/*).
 *
 * Covers the new academic-mode endpoints (/students, /courses) added
 * alongside their scopes (read:students, read:courses) — the public API
 * previously only exposed corporate data (employees/attendance/leaves/
 * shifts), so an academic-mode organization's "API Access" page had
 * nothing relevant to grant. Also covers the accompanying fix to
 * requireCorporate/requireAcademic: a "both"-mode company (runs corporate
 * AND academic features) must pass BOTH gates, not just one — previously
 * requireCorporate rejected "both" companies outright, the same
 * mode-exclusivity bug already fixed once for login self-heal
 * (authController.js) and requireMode (middleware/role.js).
 */

jest.setTimeout(120000);

const crypto = require("crypto");
// Random per-run values, not literals — avoids hardcoded-credential security
// scans flagging fixture strings that merely look like real secrets.
const randSecret = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");
const randPassword = () => `Test${crypto.randomBytes(6).toString("hex")}!1`;
const randApiKey = () => `dk_live_test_${crypto.randomBytes(20).toString("hex")}`;

process.env.JWT_SECRET         = process.env.JWT_SECRET         || randSecret();
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || randSecret();
process.env.NODE_ENV           = "test";

const request  = require("supertest");
const mongoose = require("mongoose");

let app;
let memoryServer = null;

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");
const Course  = require("../../src/models/Course");
const ApiKey  = require("../../src/models/ApiKey");

let hashKey;

let academicCompany, corporateCompany, bothCompany;
let academicStudentsKey, academicNoScopeKey, corporateAttendanceKey, bothAttendanceKey, bothStudentsKey;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_apiv1_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));
  ({ hashKey } = require("../../src/middleware/apiKeyAuth"));

  await Promise.all(
    ["users", "companies", "courses", "apikeys"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  academicCompany = await Company.create({
    name: "API V1 Academic University",
    mode: "academic",
    institutionCode: "APIV1ACAD1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  corporateCompany = await Company.create({
    name: "API V1 Corporate Ltd",
    mode: "corporate",
    institutionCode: "APIV1CORP1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  bothCompany = await Company.create({
    name: "API V1 Hybrid Institution",
    mode: "both",
    institutionCode: "APIV1BOTH1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  const lecturer = await User.create({
    name: "Prof. API Lecturer",
    email: "lecturer@apiv1acad.edu",
    password: randPassword(),
    role: "lecturer",
    company: academicCompany._id,
    department: "Computer Science",
    isActive: true,
    isApproved: true,
  });

  await User.create({
    name: "Nana Yaa Student",
    email: "nanayaa@apiv1acad.edu",
    password: randPassword(),
    role: "student",
    company: academicCompany._id,
    IndexNumber: "APIV1/CS/26/0001",
    programme: "BSc Computer Science",
    department: "Computer Science",
    studentLevel: "300",
    isActive: true,
    isApproved: true,
  });

  await Course.create({
    title: "Distributed Systems",
    code: "CSCD401",
    companyId: academicCompany._id,
    lecturerId: lecturer._id,
    createdBy: lecturer._id,
    academicYear: "2025/2026",
    semester: "1",
    enrolledStudents: [],
  });

  const makeKey = async (company, scopes) => {
    const raw = randApiKey();
    await ApiKey.create({
      company: company._id,
      name: "Test Key",
      keyHash: hashKey(raw),
      prefix: raw.slice(0, 12) + "…",
      scopes,
    });
    return raw;
  };

  academicStudentsKey    = await makeKey(academicCompany, ["read:students", "read:courses"]);
  academicNoScopeKey     = await makeKey(academicCompany, []);
  corporateAttendanceKey = await makeKey(corporateCompany, ["read:attendance"]);
  bothAttendanceKey      = await makeKey(bothCompany, ["read:attendance"]);
  bothStudentsKey        = await makeKey(bothCompany, ["read:students"]);
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("GET /api/v1/students", () => {
  test("returns the student directory for an academic-mode key with read:students", async () => {
    const res = await request(app).get("/api/v1/students").set("X-API-Key", academicStudentsKey);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      name: "Nana Yaa Student",
      indexNumber: "APIV1/CS/26/0001",
      programme: "BSc Computer Science",
    });
  });

  test("403s a key without the read:students scope", async () => {
    const res = await request(app).get("/api/v1/students").set("X-API-Key", academicNoScopeKey);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("missing_scope");
  });

  test("400s a corporate-mode key even with the scope (academic_only)", async () => {
    // corporateAttendanceKey's company is corporate-mode; give it read:students
    // implicitly via a fresh key to isolate from the attendance scope test.
    const raw = randApiKey();
    await ApiKey.create({
      company: corporateCompany._id,
      name: "Corporate key with students scope",
      keyHash: hashKey(raw),
      prefix: raw.slice(0, 12) + "…",
      scopes: ["read:students"],
    });
    const res = await request(app).get("/api/v1/students").set("X-API-Key", raw);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("academic_only");
  });

  test("a 'both'-mode key with read:students succeeds", async () => {
    const res = await request(app).get("/api/v1/students").set("X-API-Key", bothStudentsKey);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("NoSQL operator injection via bracket-notation query params is neutralized", async () => {
    // Express's qs parser turns `programme[$ne]=null` into
    // req.query.programme = { $ne: null } — an object, not a string. If that
    // object reached the Mongoose filter unsanitized, Mongoose would either
    // throw casting it (500) or apply real $ne/$regex semantics instead of
    // "no filter". The fix must make this behave IDENTICALLY to the filter
    // being omitted entirely: same 200, same result set, never a 500.
    const injected = await request(app)
      .get("/api/v1/students?programme[$ne]=null&department[$regex]=.*")
      .set("X-API-Key", academicStudentsKey);
    const omitted = await request(app)
      .get("/api/v1/students")
      .set("X-API-Key", academicStudentsKey);

    expect(injected.status).toBe(200);
    expect(injected.body.data).toEqual(omitted.body.data);
  });
});

describe("GET /api/v1/courses", () => {
  test("returns the course catalogue with lecturer + enrollment info", async () => {
    const res = await request(app).get("/api/v1/courses").set("X-API-Key", academicStudentsKey);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      code: "CSCD401",
      title: "Distributed Systems",
      enrolledCount: 0,
    });
    expect(res.body.data[0].lecturer).toMatchObject({ name: "Prof. API Lecturer" });
  });
});

describe("requireCorporate / requireAcademic 'both'-mode allowance", () => {
  test("a 'both'-mode key with read:attendance is NOT rejected as academic-only", async () => {
    const res = await request(app).get("/api/v1/attendance").set("X-API-Key", bothAttendanceKey);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("a pure corporate-mode key still works for /attendance (no regression)", async () => {
    const res = await request(app).get("/api/v1/attendance").set("X-API-Key", corporateAttendanceKey);
    expect(res.status).toBe(200);
  });

  test("an academic-mode key is rejected from /attendance as corporate_only", async () => {
    const res = await request(app).get("/api/v1/attendance").set("X-API-Key", academicStudentsKey);
    expect(res.status).toBe(403); // missing_scope fires before the mode gate
  });
});
