"use strict";

/**
 * Lecturer in-session unlock scope.
 *
 * POST /api/users/:id/unlock-account-device previously let any lecturer
 * unlock any user in the company (the route allowed the role with no
 * further checks). It is now scoped for lecturers: they must have an
 * attendance session in progress, and the target must be a student
 * enrolled in that session's course (any of the lecturer's courses when
 * the session has none). Admin/HOD/manager remain unscoped.
 *
 * GET /api/users/lecturer-locked-students lists the students a lecturer
 * may unlock right now (device-locked or in the post-logout cooldown).
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
const Timetable         = require("../../src/models/Timetable");
const { SIX_HOURS_MS }  = require("../../src/middleware/deviceValidation");

const LECTURER_PASSWORD = randPassword();
const HOD_PASSWORD      = randPassword();
const STUDENT_PASSWORD  = randPassword();

let companyId, lecturerId, otherLecturerId, lecturerToken, hodToken;
let courseA, courseB, courseC;
let studentA, studentB, studentC;

async function makeStudent(name) {
  const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  return User.create({
    name,
    email: `${name.toLowerCase().replace(/\s+/g, "")}${uniq}@lecunlock.edu`,
    IndexNumber: `LCU/${uniq}`,
    password: STUDENT_PASSWORD,
    role: "student",
    company: companyId,
    isActive: true,
    isApproved: true,
  });
}

function activeCooldown() {
  return new Date();
}

async function setCooldown(student) {
  await User.findByIdAndUpdate(student._id, { lastLogoutTime: activeCooldown() });
}

async function clearSessions() {
  await AttendanceSession.deleteMany({ company: companyId });
}

const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// A slot whose window comfortably covers the current time.
function coveringWindow() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return {
    dayOfWeek: now.getDay(),
    startTime: minToHHMM(Math.max(0, nowMin - 60)),
    endTime:   minToHHMM(Math.min(1439, nowMin + 60)),
  };
}

// A same-day slot far from the current time (beyond the 15-min grace).
function farWindow() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = nowMin < 720 ? 1200 : 120; // 20:00 when it's morning, 02:00 otherwise
  return { dayOfWeek: now.getDay(), startTime: minToHHMM(start), endTime: minToHHMM(start + 60) };
}

async function addSlot(course, window) {
  return Timetable.create({ company: companyId, lecturer: lecturerId, course: course._id, isActive: true, ...window });
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_lecturer_unlock_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "courses", "attendancesessions", "timetables"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  const company = await Company.create({
    name: "Lecturer Unlock Uni",
    mode: "academic",
    institutionCode: "LECUNLK1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  companyId = company._id;

  const lecturer = await User.create({
    name: "Unlock Lecturer",
    email: "lecturer@lecunlock.edu",
    password: LECTURER_PASSWORD,
    role: "lecturer",
    company: companyId,
    department: "CS",
    isActive: true,
    isApproved: true,
  });
  lecturerId = lecturer._id;

  const otherLecturer = await User.create({
    name: "Other Lecturer",
    email: "other@lecunlock.edu",
    password: LECTURER_PASSWORD,
    role: "lecturer",
    company: companyId,
    department: "CS",
    isActive: true,
    isApproved: true,
  });
  otherLecturerId = otherLecturer._id;

  await User.create({
    name: "Unlock HOD",
    email: "hod@lecunlock.edu",
    password: HOD_PASSWORD,
    role: "hod",
    company: companyId,
    department: "CS",
    isActive: true,
    isApproved: true,
  });

  studentA = await makeStudent("Student Alpha");
  studentB = await makeStudent("Student Beta");
  studentC = await makeStudent("Student Gamma");

  courseA = await Course.create({
    title: "Course A", code: "CSA101", companyId,
    lecturerId, createdBy: lecturerId, enrolledStudents: [studentA._id],
  });
  courseB = await Course.create({
    title: "Course B", code: "CSB101", companyId,
    lecturerId, createdBy: lecturerId, enrolledStudents: [studentB._id],
  });
  courseC = await Course.create({
    title: "Course C", code: "CSC101", companyId,
    lecturerId: otherLecturerId, createdBy: otherLecturerId, enrolledStudents: [studentC._id],
  });

  const lecLogin = await request(app).post("/api/auth/login")
    .send({ email: "lecturer@lecunlock.edu", password: LECTURER_PASSWORD, loginRole: "lecturer" });
  expect(lecLogin.status).toBe(200);
  lecturerToken = lecLogin.body.token;

  const hodLogin = await request(app).post("/api/auth/login")
    .send({ email: "hod@lecunlock.edu", password: HOD_PASSWORD, loginRole: "hod" });
  expect(hodLogin.status).toBe(200);
  hodToken = hodLogin.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("lecturer unlock scope", () => {
  test("without a running session: unlock is refused and the list reports inactive", async () => {
    await clearSessions();
    await setCooldown(studentA);

    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
    expect(unlock.body.error).toMatch(/session/i);

    const list = await request(app)
      .get("/api/users/lecturer-locked-students")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.active).toBe(false);

    const fresh = await User.findById(studentA._id);
    expect(fresh.lastLogoutTime).not.toBeNull();
  });

  test("an ended session does not count as running", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "ended" });
    await setCooldown(studentA);

    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
  });

  test("with a running session: enrolled student is listed and can be unlocked", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });
    await setCooldown(studentA);

    const list = await request(app)
      .get("/api/users/lecturer-locked-students")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.active).toBe(true);
    expect(list.body.students.map(s => String(s._id))).toContain(String(studentA._id));

    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(200);

    const fresh = await User.findById(studentA._id);
    expect(fresh.lastLogoutTime).toBeNull();
  });

  test("session scoped to course A: student of the lecturer's other course is refused and unlisted", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "live" });
    await setCooldown(studentB);

    const list = await request(app)
      .get("/api/users/lecturer-locked-students")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.body.students.map(s => String(s._id))).not.toContain(String(studentB._id));

    const unlock = await request(app)
      .post(`/api/users/${studentB._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
    expect(unlock.body.error).toMatch(/enrolled/i);
  });

  test("another lecturer's student is always refused", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });
    await setCooldown(studentC);

    const unlock = await request(app)
      .post(`/api/users/${studentC._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
  });

  test("a course-less session falls back to any course the lecturer teaches", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: null, status: "active" });
    await setCooldown(studentB);

    const unlock = await request(app)
      .post(`/api/users/${studentB._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(200);

    const fresh = await User.findById(studentB._id);
    expect(fresh.lastLogoutTime).toBeNull();

    // ...but still not another lecturer's student
    await setCooldown(studentC);
    const denied = await request(app)
      .post(`/api/users/${studentC._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(denied.status).toBe(403);
  });

  test("lecturers cannot unlock non-student accounts even mid-session", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });

    const unlock = await request(app)
      .post(`/api/users/${otherLecturerId}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
    expect(unlock.body.error).toMatch(/student accounts/i);
  });

  test("device-locked student appears in the list alongside cooldown students", async () => {
    await clearSessions();
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });
    await User.findByIdAndUpdate(studentA._id, {
      lastLogoutTime: null,
      accountDeviceLock: { isLocked: true, lockedUntil: new Date(Date.now() + SIX_HOURS_MS) },
    });

    const list = await request(app)
      .get("/api/users/lecturer-locked-students")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.body.students.map(s => String(s._id))).toContain(String(studentA._id));

    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(200);

    const fresh = await User.findById(studentA._id);
    expect(fresh.accountDeviceLock.isLocked).toBe(false);
  });

  test("HOD unlock stays unscoped (no session required) — regression", async () => {
    await clearSessions();
    await setCooldown(studentC);

    const unlock = await request(app)
      .post(`/api/users/${studentC._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${hodToken}`)
      .send({});
    expect(unlock.status).toBe(200);

    const fresh = await User.findById(studentC._id);
    expect(fresh.lastLogoutTime).toBeNull();
  });
});

// The tests above run with NO timetable rows, which doubles as coverage of
// the fallback for institutions that don't timetable their lecturers. Once a
// lecturer HAS timetable entries, a running session alone is no longer
// enough — the current time must fall inside a scheduled slot, for the
// session's course.
describe("lecturer unlock timetable gate", () => {
  beforeEach(async () => {
    await clearSessions();
    await Timetable.deleteMany({ company: companyId });
  });

  test("running session outside every scheduled slot is refused", async () => {
    await addSlot(courseA, farWindow());
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });
    await setCooldown(studentA);

    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
    expect(unlock.body.error).toMatch(/scheduled class/i);

    const list = await request(app)
      .get("/api/users/lecturer-locked-students")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.body.active).toBe(false);
    expect(list.body.reason).toBe("outside_timetable");
  });

  test("running session inside the scheduled slot for its course is allowed", async () => {
    await addSlot(courseA, coveringWindow());
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });
    await setCooldown(studentA);

    const list = await request(app)
      .get("/api/users/lecturer-locked-students")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.body.active).toBe(true);
    expect(list.body.students.map(s => String(s._id))).toContain(String(studentA._id));

    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(200);

    const fresh = await User.findById(studentA._id);
    expect(fresh.lastLogoutTime).toBeNull();
  });

  test("session for a course not scheduled right now is refused (course B session during course A slot)", async () => {
    await addSlot(courseA, coveringWindow());
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseB._id, status: "active" });
    await setCooldown(studentB);

    const unlock = await request(app)
      .post(`/api/users/${studentB._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(403);
    expect(unlock.body.error).toMatch(/scheduled class/i);
  });

  test("course-less session narrows to the course scheduled now, not all the lecturer's courses", async () => {
    await addSlot(courseA, coveringWindow());
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: null, status: "active" });
    await setCooldown(studentA);
    await setCooldown(studentB);

    const okUnlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(okUnlock.status).toBe(200);

    const denied = await request(app)
      .post(`/api/users/${studentB._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(denied.status).toBe(403);
  });

  test("inactive slots are ignored — with none active the no-timetable fallback applies", async () => {
    const slot = await addSlot(courseA, coveringWindow());
    await Timetable.findByIdAndUpdate(slot._id, { isActive: false });
    await AttendanceSession.create({ company: companyId, createdBy: lecturerId, course: courseA._id, status: "active" });
    await setCooldown(studentA);

    // With the only slot inactive, the lecturer has no active timetable rows
    // left, so the no-timetable fallback applies — unlock succeeds by
    // session-course scope.
    const unlock = await request(app)
      .post(`/api/users/${studentA._id}/unlock-account-device`)
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({});
    expect(unlock.status).toBe(200);
  });
});
