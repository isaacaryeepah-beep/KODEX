"use strict";

/**
 * Integration tests for the GPS geofence attendance method — the
 * hardware-free backup to the ESP32 flow. Runs the real Express app
 * (supertest) against a real MongoDB (mongodb-memory-server in CI,
 * TEST_MONGO_URI locally).
 *
 * Flow under test:
 *   POST /api/attendance-sessions/start  with gpsGeofence {lat,lng,radius}
 *     → creates a device-less session (the classic path 503s with no ESP32)
 *   POST /api/attendance-sessions/mark   with method:'gps' + coordinates
 *     → server computes haversine distance and accepts/rejects
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-gps-suite-000000000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-gps-suite-0001";
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
const AttendanceRecord  = require("../../src/models/AttendanceRecord");
const { generateToken } = require("../../src/utils/jwt");

// Geofence center (Accra) and offsets: ~0.00045° lat ≈ 50 m, 0.01° ≈ 1.1 km.
const CENTER = { lat: 5.6037, lng: -0.187 };
const INSIDE  = { lat: CENTER.lat + 0.00045, lng: CENTER.lng };
const OUTSIDE = { lat: CENTER.lat + 0.01,    lng: CENTER.lng };

let company, lecturer, studentA, studentB, course;
let lecturerToken, studentAToken, studentBToken;
let gpsSession;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_gps_attendance_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "courses", "attendancesessions", "attendancerecords", "devices", "suspiciousevents"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "GPS Attendance Test University",
    mode: "academic",
    institutionCode: "GPS" + Date.now().toString().slice(-6),
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  lecturer = await User.create({
    name: "Dr. Geo Fence", email: `lect${Date.now()}@gps.edu`, password: "Passw0rd!123",
    role: "lecturer", company: company._id, department: "CS", isActive: true, isApproved: true,
  });
  studentA = await User.create({
    name: "Student Inside", email: `sa${Date.now()}@gps.edu`, password: "Passw0rd!123",
    role: "student", company: company._id, department: "CS", IndexNumber: "GPS-A-" + Date.now(),
    isActive: true, isApproved: true,
  });
  studentB = await User.create({
    name: "Student SharedPhone", email: `sb${Date.now()}@gps.edu`, password: "Passw0rd!123",
    role: "student", company: company._id, department: "CS", IndexNumber: "GPS-B-" + Date.now(),
    isActive: true, isApproved: true,
  });

  course = await Course.create({
    title: "Geofencing 101", code: "GPS101", companyId: company._id,
    lecturerId: lecturer._id, createdBy: lecturer._id,
    enrolledStudents: [studentA._id, studentB._id],
  });

  lecturerToken = generateToken(lecturer._id);
  studentAToken = generateToken(studentA._id);
  studentBToken = generateToken(studentB._id);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe("POST /api/attendance-sessions/start — GPS geofence mode", () => {
  test("classic (device) mode still 503s when no ESP32 is paired — regression guard", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/start")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ courseId: course._id.toString(), title: "Classic no-device attempt" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/device/i);
  });

  test("rejects an out-of-range radius", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/start")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({
        courseId: course._id.toString(),
        gpsGeofence: { latitude: CENTER.lat, longitude: CENTER.lng, radiusMeters: 5000 },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/radius/i);
  });

  test("rejects invalid coordinates", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/start")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({
        courseId: course._id.toString(),
        gpsGeofence: { latitude: 999, longitude: CENTER.lng, radiusMeters: 100 },
      });
    expect(res.status).toBe(400);
  });

  test("starts a GPS session with NO device paired — the headline behavior", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/start")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({
        courseId: course._id.toString(),
        title: "GPS Backup Session",
        durationSeconds: 3600,
        gpsGeofence: { latitude: CENTER.lat, longitude: CENTER.lng, radiusMeters: 100 },
      });
    expect(res.status).toBe(201);
    expect(res.body.gpsMode).toBe(true);
    expect(res.body.session.geoLat).toBe(CENTER.lat);
    expect(res.body.session.geoLng).toBe(CENTER.lng);
    expect(res.body.session.geoRadiusMeters).toBe(100);
    expect(res.body.session.deviceId).toBeNull();
    gpsSession = res.body.session;
  });
});

describe("POST /api/attendance-sessions/mark — method gps", () => {
  test("rejects a mark with missing coordinates", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({ sessionId: gpsSession._id, method: "gps", deviceId: "phone-A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/latitude|position/i);
  });

  test("rejects a hopelessly imprecise GPS reading (accuracy ≫ radius)", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({
        sessionId: gpsSession._id, method: "gps", deviceId: "phone-A",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 900,
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/imprecise/i);
  });

  test("rejects a student outside the geofence, creating no record", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({
        sessionId: gpsSession._id, method: "gps", deviceId: "phone-A",
        latitude: OUTSIDE.lat, longitude: OUTSIDE.lng, accuracy: 15,
      });
    expect(res.status).toBe(403);
    expect(res.body.outsideGeofence).toBe(true);
    expect(res.body.distanceMeters).toBeGreaterThan(1000);

    const records = await AttendanceRecord.find({ session: gpsSession._id }).lean();
    expect(records.length).toBe(0);
  });

  test("marks a student inside the geofence present, with distance recorded", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({
        sessionId: gpsSession._id, method: "gps", deviceId: "phone-A",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 12,
      });
    expect(res.status).toBe(201);
    expect(res.body.record.method).toBe("gps_mark");
    expect(res.body.record.status).toBe("present");

    const record = await AttendanceRecord.findOne({ session: gpsSession._id, user: studentA._id }).lean();
    expect(record.gpsDistanceMeters).toBeGreaterThanOrEqual(0);
    expect(record.gpsDistanceMeters).toBeLessThanOrEqual(100);
    expect(record.gpsAccuracy).toBe(12);
  });

  test("rejects a duplicate mark by the same student", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({
        sessionId: gpsSession._id, method: "gps", deviceId: "phone-A",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 12,
      });
    expect(res.status).toBe(409);
  });

  test("blocks a second student marking from the same physical phone", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentBToken}`)
      .send({
        sessionId: gpsSession._id, method: "gps", deviceId: "phone-A",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 12,
      });
    expect(res.status).toBe(403);
    expect(res.body.deviceLocked).toBe(true);
  });

  test("rejects GPS marking against a session that was not started in GPS mode", async () => {
    // Created directly via the model — the classic start path requires a
    // paired device, which is exactly what this suite runs without.
    const classicSession = await AttendanceSession.create({
      company: company._id, createdBy: lecturer._id, course: course._id,
      title: "Classic session", status: "active", startedAt: new Date(),
      durationSeconds: 3600, deviceId: null, esp32Seed: null,
    });
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentBToken}`)
      .send({
        sessionId: classicSession._id.toString(), method: "gps", deviceId: "phone-B",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 12,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not accept GPS/i);
    await classicSession.deleteOne();
  });

  test("marks a student late when the session started >15 min ago", async () => {
    const lateSession = await AttendanceSession.create({
      company: company._id, createdBy: lecturer._id, course: course._id,
      title: "Late GPS session", status: "active",
      startedAt: new Date(Date.now() - 20 * 60000), durationSeconds: 3600,
      deviceId: null, esp32Seed: null,
      geoLat: CENTER.lat, geoLng: CENTER.lng, geoRadiusMeters: 100,
    });
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentBToken}`)
      .send({
        sessionId: lateSession._id.toString(), method: "gps", deviceId: "phone-B",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 10,
      });
    expect(res.status).toBe(201);
    expect(res.body.record.status).toBe("late");
    expect(res.body.record.method).toBe("gps_mark");
  });
});

describe("Campus WiFi rescue — marking from a known campus IP overrides a failing GPS check", () => {
  const SESSION_WIFI_IP = "197.251.144.12";
  const CAMPUS_WIFI_IP  = "41.66.200.5";
  const STRANGER_IP     = "8.8.8.8";

  let wifiSession, studentC, studentD, studentCToken, studentDToken;

  beforeAll(async () => {
    // The one-session-at-a-time guard would 409 the new start while the
    // suite's earlier GPS session is still live.
    await AttendanceSession.updateMany(
      { createdBy: lecturer._id, status: { $in: ["active", "live", "paused", "locked"] } },
      { $set: { status: "stopped", stoppedAt: new Date() } }
    );

    // Admin-configured campus-wide WiFi IP (endpoint coercion is covered in
    // campusSettings.test.js — here we test the marking behaviour it feeds).
    await Company.updateOne(
      { _id: company._id },
      { $set: { "academicSettings.allowedWifiIPs": [CAMPUS_WIFI_IP] } }
    );

    studentC = await User.create({
      name: "Student Indoors", email: `sc${Date.now()}@gps.edu`, password: "Passw0rd!123",
      role: "student", company: company._id, department: "CS", IndexNumber: "GPS-C-" + Date.now(),
      isActive: true, isApproved: true,
    });
    studentD = await User.create({
      name: "Student Elsewhere", email: `sd${Date.now()}@gps.edu`, password: "Passw0rd!123",
      role: "student", company: company._id, department: "CS", IndexNumber: "GPS-D-" + Date.now(),
      isActive: true, isApproved: true,
    });
    await Course.updateOne({ _id: course._id }, { $addToSet: { enrolledStudents: { $each: [studentC._id, studentD._id] } } });
    studentCToken = generateToken(studentC._id);
    studentDToken = generateToken(studentD._id);
  });

  test("start stores the saved location's WiFi IP on the session", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/start")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({
        courseId: course._id.toString(),
        title: "WiFi-backed GPS session",
        durationSeconds: 3600,
        gpsGeofence: { latitude: CENTER.lat, longitude: CENTER.lng, radiusMeters: 100, wifiIp: ` ${SESSION_WIFI_IP} ` },
      });
    expect(res.status).toBe(201);
    expect(res.body.session.geoWifiIp).toBe(SESSION_WIFI_IP);
    wifiSession = res.body.session;
  });

  test("outside the geofence but on the session's WiFi → rescued, marked present", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentCToken}`)
      .set("X-Forwarded-For", SESSION_WIFI_IP)
      .send({
        sessionId: wifiSession._id, method: "gps", deviceId: "phone-C",
        latitude: OUTSIDE.lat, longitude: OUTSIDE.lng, accuracy: 15,
      });
    expect(res.status).toBe(201);
    expect(res.body.record.status).toBe("present");
    const record = await AttendanceRecord.findOne({ session: wifiSession._id, user: studentC._id }).lean();
    expect(record.gpsDistanceMeters).toBeGreaterThan(100);
  });

  test("outside the geofence on an unknown network → still 403, with a WiFi hint", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentDToken}`)
      .set("X-Forwarded-For", STRANGER_IP)
      .send({
        sessionId: wifiSession._id, method: "gps", deviceId: "phone-D",
        latitude: OUTSIDE.lat, longitude: OUTSIDE.lng, accuracy: 15,
      });
    expect(res.status).toBe(403);
    expect(res.body.outsideGeofence).toBe(true);
    expect(res.body.error).toMatch(/connect to the campus WiFi/i);
    const records = await AttendanceRecord.find({ session: wifiSession._id, user: studentD._id }).lean();
    expect(records.length).toBe(0);
  });

  test("hopelessly imprecise reading but on an admin-configured campus IP → rescued", async () => {
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentDToken}`)
      .set("X-Forwarded-For", CAMPUS_WIFI_IP)
      .send({
        sessionId: wifiSession._id, method: "gps", deviceId: "phone-D",
        latitude: INSIDE.lat, longitude: INSIDE.lng, accuracy: 900,
      });
    expect(res.status).toBe(201);
    expect(res.body.record.method).toBe("gps_mark");
  });

  test("a plain GPS session (no WiFi configured anywhere) keeps the original error text", async () => {
    await Company.updateOne(
      { _id: company._id },
      { $set: { "academicSettings.allowedWifiIPs": [] } }
    );
    const plainSession = await AttendanceSession.create({
      company: company._id, createdBy: lecturer._id, course: course._id,
      title: "Plain GPS session", status: "active", startedAt: new Date(),
      durationSeconds: 3600, deviceId: null, esp32Seed: null,
      geoLat: CENTER.lat, geoLng: CENTER.lng, geoRadiusMeters: 100,
    });
    const res = await request(app)
      .post("/api/attendance-sessions/mark")
      .set("Authorization", `Bearer ${studentDToken}`)
      .set("X-Forwarded-For", STRANGER_IP)
      .send({
        sessionId: plainSession._id.toString(), method: "gps", deviceId: "phone-D",
        latitude: OUTSIDE.lat, longitude: OUTSIDE.lng, accuracy: 15,
      });
    expect(res.status).toBe(403);
    expect(res.body.error).not.toMatch(/campus WiFi/i);
  });
});

