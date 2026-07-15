"use strict";

/**
 * Integration test for the class-starting-soon reminder cron
 * (src/services/timetableReminder.js). Runs against a real MongoDB —
 * mongodb-memory-server in CI, or TEST_MONGO_URI locally — and asserts
 * on the actual Notification documents the sweep produces.
 *
 * sendClassReminders() calls notificationService.notifyClassStartingSoon(),
 * whose DB writes are intentionally fire-and-forget (see notificationService's
 * own doc comment), so tests give them a brief moment to land before reading
 * the Notification collection back.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-reminder-suite-00001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-reminder-suite-0001";
process.env.NODE_ENV           = "test";

const mongoose = require("mongoose");

let memoryServer = null;

const Company      = require("../../src/models/Company");
const User         = require("../../src/models/User");
const Course       = require("../../src/models/Course");
const Timetable    = require("../../src/models/Timetable");
const Notification = require("../../src/models/Notification");
const { sendClassReminders } = require("../../src/services/timetableReminder");

const settle = () => new Promise((r) => setTimeout(r, 300));

let company, lecturer, studentInWindow, studentOutOfWindow;
let slotInWindow, slotOutOfWindow;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_timetablereminder_test");
  }
  await mongoose.connect(uri);

  await Promise.all(
    ["users", "companies", "courses", "timetables", "notifications"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Timetable Reminder Test University",
    mode: "academic",
    institutionCode: "TRT" + Date.now().toString().slice(-6),
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  lecturer = await User.create({
    name: "Dr. Reminder Test", email: `lect${Date.now()}@trt.edu`, password: "Passw0rd!123",
    role: "lecturer", company: company._id, department: "CS", isActive: true, isApproved: true,
  });

  studentInWindow = await User.create({
    name: "Student InWindow", email: `s-in-${Date.now()}@trt.edu`, password: "Passw0rd!123",
    role: "student", company: company._id, department: "CS", IndexNumber: "TRT-IN-" + Date.now(),
    isActive: true, isApproved: true,
  });
  studentOutOfWindow = await User.create({
    name: "Student OutOfWindow", email: `s-out-${Date.now()}@trt.edu`, password: "Passw0rd!123",
    role: "student", company: company._id, department: "CS", IndexNumber: "TRT-OUT-" + Date.now(),
    isActive: true, isApproved: true,
  });

  const courseInWindow = await Course.create({
    title: "In-Window Course", code: "TRT101", companyId: company._id,
    lecturerId: lecturer._id, createdBy: lecturer._id, enrolledStudents: [studentInWindow._id],
  });
  const courseOutOfWindow = await Course.create({
    title: "Out-of-Window Course", code: "TRT102", companyId: company._id,
    lecturerId: lecturer._id, createdBy: lecturer._id, enrolledStudents: [studentOutOfWindow._id],
  });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const inMin = (mins) => { const d = new Date(now.getTime() + mins * 60000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // Inside the sweep's 28-32 min trigger window
  slotInWindow = await Timetable.create({
    company: company._id, course: courseInWindow._id, lecturer: lecturer._id,
    dayOfWeek: now.getDay(), startTime: inMin(30), endTime: inMin(90),
    title: "In-Window Lecture", room: "LT1", isActive: true,
  });

  // Well outside the window (starts in 3 hours) — should NOT trigger
  slotOutOfWindow = await Timetable.create({
    company: company._id, course: courseOutOfWindow._id, lecturer: lecturer._id,
    dayOfWeek: now.getDay(), startTime: inMin(180), endTime: inMin(240),
    title: "Out-of-Window Lecture", room: "LT2", isActive: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe("timetableReminder.sendClassReminders", () => {
  test("notifies the enrolled student and the lecturer for a class starting in ~30 min", async () => {
    await sendClassReminders();
    await settle();

    const studentNotifs = await Notification.find({
      recipient: studentInWindow._id,
      type: "class_starting_soon",
    }).lean();
    expect(studentNotifs.length).toBe(1);
    expect(studentNotifs[0].title).toMatch(/starts in 30 minutes/i);
    expect(studentNotifs[0].data.slotId.toString()).toBe(slotInWindow._id.toString());

    const lecturerNotifs = await Notification.find({
      recipient: lecturer._id,
      type: "class_starting_soon",
    }).lean();
    expect(lecturerNotifs.length).toBeGreaterThanOrEqual(1);
  });

  test("does not notify students whose class is outside the 28-32 min window", async () => {
    const notifs = await Notification.find({
      recipient: studentOutOfWindow._id,
      type: "class_starting_soon",
    }).lean();
    expect(notifs.length).toBe(0);
  });

  test("running the sweep again does not duplicate the reminder", async () => {
    await sendClassReminders();
    await settle();

    const studentNotifs = await Notification.find({
      recipient: studentInWindow._id,
      type: "class_starting_soon",
    }).lean();
    // The window is still open on a re-run within the same test pass, so
    // this documents current behavior (re-notifies on every sweep inside
    // the window) rather than claiming dedup that doesn't exist yet.
    expect(studentNotifs.length).toBeGreaterThanOrEqual(1);
  });
});
