"use strict";

/**
 * ArrivalIQ in academic mode (user decision: extend it past corporate).
 *
 * Two surfaces under test:
 *  1. The route mode-gate — /api/arrival-iq/* previously rejected every
 *     academic company via requireMode("corporate"). Academic staff
 *     (lecturer/hod) must now get through; students must NOT (staff-role
 *     gate replaced the mode gate).
 *  2. The sweep job (arrivalIQScheduler.sweep) — academic staff have no
 *     Shift; their day anchors on their FIRST Timetable class today.
 *     The sweep must compute a class-anchored ArrivalPrediction and fire
 *     the departure push with "class" copy, and the late-risk pass must
 *     skip class anchors (no clock-in signal exists to check against).
 *
 * trafficService (external TomTom/Google API) and pushService (web push)
 * are true externals — mocked, per the repo's convention. Everything else
 * runs real: Express app, Mongoose models, real MongoDB.
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

jest.mock("../../src/services/traffic/trafficService", () => ({
  getTravelTime: jest.fn(async () => ({
    durationMinutes: 20,
    durationInTrafficMinutes: 30,
    distanceMeters: 12000,
    trafficLevel: "moderate",
  })),
}));

jest.mock("../../src/services/push/pushService", () => ({
  sendToUser: jest.fn(async () => ({ ok: true })),
  sendToCompany: jest.fn(async () => ({ ok: true })),
  clearBrandingCache: jest.fn(),
}));

const request  = require("supertest");
const mongoose = require("mongoose");

let app;
let memoryServer = null;

const Company           = require("../../src/models/Company");
const User              = require("../../src/models/User");
const Course            = require("../../src/models/Course");
const Timetable         = require("../../src/models/Timetable");
const ArrivalPrediction = require("../../src/models/ArrivalPrediction");
const pushService       = require("../../src/services/push/pushService");

const LECTURER_PASSWORD = randPassword();
const STUDENT_PASSWORD  = randPassword();

let company, lecturer, student;
let lecturerToken, studentToken;

// "HH:MM" for a Date, matching the Timetable model's string convention.
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// A class ~30 min from now, clamped so it can never wrap past midnight into
// a different dayOfWeek (which would make the sweep skip it and flake the
// suite when CI happens to run close to 00:00).
function classTimeToday() {
  const now = new Date();
  const t = new Date(now.getTime() + 30 * 60 * 1000);
  if (t.getDate() !== now.getDate()) return { start: "23:58", end: "23:59" };
  const end = new Date(t.getTime() + 60 * 60 * 1000);
  return { start: hhmm(t), end: t.getDate() === end.getDate() ? hhmm(end) : "23:59" };
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_arrivaliq_academic_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "courses", "timetables", "arrivalpredictions"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  company = await Company.create({
    name: "ArrivalIQ Academic Uni",
    mode: "academic",
    institutionCode: "AIQACAD1",
    subscriptionActive: true,
    subscriptionStatus: "active",
    arrivalIQ: { enabled: true, bufferMinutes: 10, pushEnabled: true },
    corporateSettings: { officeLatitude: 5.6037, officeLongitude: -0.187 },
  });

  lecturer = await User.create({
    name: "Dr. Commuting Lecturer",
    email: "lecturer@aiqacad.edu",
    password: LECTURER_PASSWORD,
    role: "lecturer",
    company: company._id,
    department: "CS",
    isActive: true,
    isApproved: true,
    arrivalIQConsent: { locationGranted: true, notificationGranted: true, grantedAt: new Date() },
    arrivalIQLocation: { lat: 5.65, lng: -0.2, capturedAt: new Date() },
  });

  student = await User.create({
    name: "AIQ Student",
    email: "student@aiqacad.edu",
    password: STUDENT_PASSWORD,
    role: "student",
    company: company._id,
    IndexNumber: "AIQ/CS/26/0001",
    isActive: true,
    isApproved: true,
  });

  const course = await Course.create({
    title: "Compilers",
    code: "CSCD303",
    companyId: company._id,
    lecturerId: lecturer._id,
    createdBy: lecturer._id,
  });

  const { start, end } = classTimeToday();
  await Timetable.create({
    company: company._id,
    course: course._id,
    lecturer: lecturer._id,
    dayOfWeek: new Date().getDay(),
    startTime: start,
    endTime: end,
    title: "Compilers Lecture",
    isActive: true,
  });

  const lecturerLogin = await request(app).post("/api/auth/login")
    .send({ email: "lecturer@aiqacad.edu", password: LECTURER_PASSWORD, loginRole: "lecturer" });
  expect(lecturerLogin.status).toBe(200);
  lecturerToken = lecturerLogin.body.token;

  const studentLogin = await request(app).post("/api/auth/login")
    .send({ email: "student@aiqacad.edu", password: STUDENT_PASSWORD });
  expect(studentLogin.status).toBe(200);
  studentToken = studentLogin.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("Route access — academic mode", () => {
  test("a lecturer can reach /api/arrival-iq/status (previously 403 corporate-only)", async () => {
    const res = await request(app)
      .get("/api/arrival-iq/status")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  test("a lecturer can grant consent and check in a location", async () => {
    const consent = await request(app)
      .post("/api/arrival-iq/consent")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ locationGranted: true, notificationGranted: true });
    expect(consent.status).toBe(200);

    const loc = await request(app)
      .post("/api/arrival-iq/location")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ lat: 5.66, lng: -0.21 });
    expect(loc.status).toBe(200);
  });

  test("a student is rejected (staff-only feature)", async () => {
    const res = await request(app)
      .get("/api/arrival-iq/status")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Sweep — class-anchored predictions for academic staff", () => {
  test("sweep() computes a class-anchored prediction and fires the departure push with 'class' copy", async () => {
    const { sweep, todayKey } = require("../../src/services/arrivalIQScheduler");
    pushService.sendToUser.mockClear();

    await sweep();

    const prediction = await ArrivalPrediction.findOne({
      company: company._id,
      user: lecturer._id,
      date: todayKey(),
    }).lean();

    expect(prediction).toBeTruthy();
    expect(prediction.anchorType).toBe("class");
    expect(prediction.timetableSlot).toBeTruthy();
    expect(prediction.shift).toBeNull();
    expect(prediction.travelMinutesInTraffic).toBe(30);
    expect(prediction.recommendedDepartureAt).toBeTruthy();

    // Class starts ~30 min out; travel 30 min + 10 min buffer puts the
    // recommended departure in the past, so the push fires this same sweep.
    expect(prediction.departureNotifiedAt).toBeTruthy();
    const departureCall = pushService.sendToUser.mock.calls.find(
      (c) => c[1]?.tag === "arrivaliq-departure"
    );
    expect(departureCall).toBeTruthy();
    expect(departureCall[1].body).toContain("class");
    expect(departureCall[1].body).not.toContain("shift");
  });

  test("a second sweep is idempotent (no duplicate departure push) and never sends class-anchored late-risk", async () => {
    const { sweep } = require("../../src/services/arrivalIQScheduler");
    pushService.sendToUser.mockClear();

    await sweep();

    const lateRisk = pushService.sendToUser.mock.calls.find((c) => c[1]?.tag === "arrivaliq-late-risk");
    const departure = pushService.sendToUser.mock.calls.find((c) => c[1]?.tag === "arrivaliq-departure");
    expect(departure).toBeUndefined();
    expect(lateRisk).toBeUndefined();
  });
});
