"use strict";

/**
 * Session control: one-session-at-a-time guard + the extend-time endpoint.
 *
 * - POST /api/attendance-sessions/start now refuses (409) while the creator
 *   already has an in-progress session — a second open session splits marks.
 * - POST /api/attendance-sessions/:id/extend adds minutes to the marking
 *   window. Allowed: creator, admin/superadmin/HOD, or a class rep enrolled
 *   in the session's course. When the window already lapsed, extension
 *   counts from NOW so "+5 min" always means 5 more minutes of marking.
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

const Company           = require("../../src/models/Company");
const User              = require("../../src/models/User");
const Course            = require("../../src/models/Course");
const AttendanceSession = require("../../src/models/AttendanceSession");

const PASSWORD = randPassword();

let companyId, courseId, lecturerId;
let lecturerToken, otherLecturerToken, repToken, plainStudentToken;

const GPS_BODY = {
  courseId: null, // filled in beforeAll
  gpsGeofence: { latitude: 5.6037, longitude: -0.187, radiusMeters: 100 },
};

async function startGpsSession(token, overrides = {}) {
  return request(app)
    .post("/api/attendance-sessions/start")
    .set("Authorization", `Bearer ${token}`)
    .send({ ...GPS_BODY, courseId, ...overrides });
}

async function clearSessions() {
  await AttendanceSession.deleteMany({ company: companyId });
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_session_control_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "courses", "attendancesessions"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  const company = await Company.create({
    name: "Session Control Uni",
    mode: "academic",
    institutionCode: "SESSCTL1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  companyId = company._id;

  const mkUser = (over) => User.create({
    password: PASSWORD, company: companyId, isActive: true, isApproved: true, ...over,
  });

  const lecturer = await mkUser({ name: "Session Lecturer", email: "lect@sessctl.edu", role: "lecturer", department: "CS" });
  lecturerId = lecturer._id;
  await mkUser({ name: "Other Lecturer", email: "other@sessctl.edu", role: "lecturer", department: "CS" });

  const uniq = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const rep = await mkUser({ name: "Class Rep", email: `rep${uniq()}@sessctl.edu`, IndexNumber: `SC/${uniq()}`, role: "student", isClassRep: true });
  const plain = await mkUser({ name: "Plain Student", email: `plain${uniq()}@sessctl.edu`, IndexNumber: `SC/${uniq()}`, role: "student" });

  const course = await Course.create({
    title: "Session Course", code: "SC101", companyId,
    lecturerId, createdBy: lecturerId,
    enrolledStudents: [rep._id, plain._id],
  });
  courseId = course._id;

  const login = async (email, loginRole) => {
    const r = await request(app).post("/api/auth/login").send({ email, password: PASSWORD, loginRole });
    expect(r.status).toBe(200);
    return r.body.token;
  };
  lecturerToken      = await login("lect@sessctl.edu", "lecturer");
  otherLecturerToken = await login("other@sessctl.edu", "lecturer");
  repToken           = await login(rep.email, "student");
  plainStudentToken  = await login(plain.email, "student");
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("one session at a time", () => {
  test("starting a second session while one is running is refused with 409", async () => {
    await clearSessions();
    const first = await startGpsSession(lecturerToken, { title: "First" });
    expect(first.status).toBe(201);

    const second = await startGpsSession(lecturerToken, { title: "Second" });
    expect(second.status).toBe(409);
    expect(second.body.activeSessionId).toBeDefined();
    expect(second.body.message).toMatch(/First/);
  });

  test("after the running session is stopped, a new one can start", async () => {
    await clearSessions();
    const first = await startGpsSession(lecturerToken, { title: "To stop" });
    expect(first.status).toBe(201);

    await AttendanceSession.updateOne(
      { _id: first.body.session._id },
      { $set: { status: "stopped", stoppedAt: new Date() } }
    );

    const second = await startGpsSession(lecturerToken, { title: "After stop" });
    expect(second.status).toBe(201);
  });
});

describe("extend-time endpoint", () => {
  test("the creator can add time; the window grows exactly by the added minutes", async () => {
    await clearSessions();
    const started = await startGpsSession(lecturerToken, { title: "Extending" });
    expect(started.status).toBe(201);
    const id = started.body.session._id;
    expect(started.body.session.durationSeconds).toBe(300);

    const ext = await request(app)
      .post(`/api/attendance-sessions/${id}/extend`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ addMinutes: 10 });
    expect(ext.status).toBe(200);
    expect(ext.body.durationSeconds).toBe(900); // 5 min + 10 min

    const fresh = await AttendanceSession.findById(id);
    expect(fresh.durationSeconds).toBe(900);
  });

  test("a class rep enrolled in the course can add time", async () => {
    await clearSessions();
    const started = await startGpsSession(lecturerToken);
    const id = started.body.session._id;

    const ext = await request(app)
      .post(`/api/attendance-sessions/${id}/extend`)
      .set("Authorization", `Bearer ${repToken}`)
      .send({ addMinutes: 5 });
    expect(ext.status).toBe(200);
    expect(ext.body.durationSeconds).toBe(600);
  });

  test("a plain (non-rep) student is refused", async () => {
    await clearSessions();
    const started = await startGpsSession(lecturerToken);
    const id = started.body.session._id;

    const ext = await request(app)
      .post(`/api/attendance-sessions/${id}/extend`)
      .set("Authorization", `Bearer ${plainStudentToken}`)
      .send({ addMinutes: 5 });
    expect(ext.status).toBe(403);
  });

  test("a different lecturer (not the creator) is refused", async () => {
    await clearSessions();
    const started = await startGpsSession(lecturerToken);
    const id = started.body.session._id;

    const ext = await request(app)
      .post(`/api/attendance-sessions/${id}/extend`)
      .set("Authorization", `Bearer ${otherLecturerToken}`)
      .send({ addMinutes: 5 });
    expect(ext.status).toBe(403);
  });

  test("rejects out-of-range minutes", async () => {
    await clearSessions();
    const started = await startGpsSession(lecturerToken);
    const id = started.body.session._id;

    for (const bad of [0, -5, 121, "abc"]) {
      const ext = await request(app)
        .post(`/api/attendance-sessions/${id}/extend`)
        .set("Authorization", `Bearer ${lecturerToken}`)
        .send({ addMinutes: bad });
      expect(ext.status).toBe(400);
    }
  });

  test("extending a lapsed (but unstopped) window counts from now", async () => {
    await clearSessions();
    // Window closed 9 minutes ago: started 10 min ago with a 60s duration
    const session = await AttendanceSession.create({
      company: companyId, createdBy: lecturerId, course: courseId,
      status: "active", startedAt: new Date(Date.now() - 10 * 60 * 1000),
      durationSeconds: 60, mode: "online",
      geoLat: 5.6, geoLng: -0.18, geoRadiusMeters: 100,
    });

    const ext = await request(app)
      .post(`/api/attendance-sessions/${session._id}/extend`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ addMinutes: 5 });
    expect(ext.status).toBe(200);

    const closesAt = new Date(ext.body.closesAt).getTime();
    const expected = Date.now() + 5 * 60 * 1000;
    expect(Math.abs(closesAt - expected)).toBeLessThan(5000);
  });

  test("a stopped session cannot be extended", async () => {
    await clearSessions();
    const session = await AttendanceSession.create({
      company: companyId, createdBy: lecturerId, course: courseId,
      status: "stopped", startedAt: new Date(), durationSeconds: 300, mode: "online",
    });

    const ext = await request(app)
      .post(`/api/attendance-sessions/${session._id}/extend`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ addMinutes: 5 });
    expect(ext.status).toBe(404);
  });
});
