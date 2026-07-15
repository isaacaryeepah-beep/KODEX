"use strict";

/**
 * Integration test for the quiz opening/closing reminder cron
 * (src/services/quizReminder.js). Runs against a real MongoDB —
 * mongodb-memory-server in CI, or TEST_MONGO_URI locally — and asserts
 * on the actual Notification documents the sweep produces.
 *
 * Notification writes are fire-and-forget (see notificationService's own
 * doc comment), so tests give them a brief moment to land before reading
 * the Notification collection back.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-reminder-suite-00002";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-reminder-suite-0002";
process.env.NODE_ENV           = "test";

const mongoose = require("mongoose");

let memoryServer = null;

const Company      = require("../../src/models/Company");
const User         = require("../../src/models/User");
const Course       = require("../../src/models/Course");
const Quiz         = require("../../src/models/Quiz");
const Attempt      = require("../../src/models/Attempt");
const Notification = require("../../src/models/Notification");
const { sendQuizReminders } = require("../../src/services/quizReminder");

const settle = () => new Promise((r) => setTimeout(r, 300));

let company, lecturer, s1, s2, s3;
let openingQuiz, closingQuiz, outOfWindowQuiz;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_quizreminder_test");
  }
  await mongoose.connect(uri);

  await Promise.all(
    ["users", "companies", "courses", "quizzes", "attempts", "notifications"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Quiz Reminder Test University",
    mode: "academic",
    institutionCode: "QRT" + Date.now().toString().slice(-6),
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  lecturer = await User.create({
    name: "Dr. Quiz Setter", email: `lect${Date.now()}@qrt.edu`, password: "Passw0rd!123",
    role: "lecturer", company: company._id, department: "CS", isActive: true, isApproved: true,
  });

  const mkStudent = (label) => User.create({
    name: `Student ${label}`, email: `${label}-${Date.now()}@qrt.edu`, password: "Passw0rd!123",
    role: "student", company: company._id, department: "CS", IndexNumber: `QRT-${label}-${Date.now()}`,
    isActive: true, isApproved: true,
  });
  s1 = await mkStudent("Opening");
  s2 = await mkStudent("Pending");
  s3 = await mkStudent("AlreadyDone");

  const course = await Course.create({
    title: "Quiz Reminder Course", code: "QRT101", companyId: company._id,
    lecturerId: lecturer._id, createdBy: lecturer._id,
    enrolledStudents: [s1._id, s2._id, s3._id],
  });

  const now = new Date();

  // Opens in ~30 min — should trigger the opening-soon sweep for all 3.
  openingQuiz = await Quiz.create({
    title: "Opening Soon Quiz", course: course._id, company: company._id, createdBy: lecturer._id,
    startTime: new Date(now.getTime() + 30 * 60000),
    endTime: new Date(now.getTime() + 90 * 60000),
  });

  // Already open, closes in ~30 min — should trigger closing-soon for s1
  // and s2 only; s3 already has an Attempt and must be skipped.
  closingQuiz = await Quiz.create({
    title: "Closing Soon Quiz", course: course._id, company: company._id, createdBy: lecturer._id,
    startTime: new Date(now.getTime() - 30 * 60000),
    endTime: new Date(now.getTime() + 30 * 60000),
  });
  await Attempt.create({
    quiz: closingQuiz._id, student: s3._id, company: company._id, attemptNumber: 1, status: "submitted",
  });

  // Opens in 4 hours — well outside the trigger window, must stay silent.
  outOfWindowQuiz = await Quiz.create({
    title: "Far Future Quiz", course: course._id, company: company._id, createdBy: lecturer._id,
    startTime: new Date(now.getTime() + 4 * 3600000),
    endTime: new Date(now.getTime() + 5 * 3600000),
  });

  await sendQuizReminders();
  await settle();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe("quizReminder — opening soon", () => {
  test("notifies every enrolled student when a quiz opens in ~30 min", async () => {
    for (const student of [s1, s2, s3]) {
      const notifs = await Notification.find({ recipient: student._id, type: "quiz_opening_soon" }).lean();
      expect(notifs.length).toBe(1);
      expect(notifs[0].data.quizId.toString()).toBe(openingQuiz._id.toString());
      expect(notifs[0].title).toMatch(/opens soon/i);
    }
  });

  test("does not fire for a quiz far outside the trigger window", async () => {
    const notifs = await Notification.find({
      "data.quizId": outOfWindowQuiz._id,
    }).lean();
    expect(notifs.length).toBe(0);
  });
});

describe("quizReminder — closing soon", () => {
  test("notifies students who have not attempted the quiz yet", async () => {
    for (const student of [s1, s2]) {
      const notifs = await Notification.find({ recipient: student._id, type: "quiz_closing_soon" }).lean();
      expect(notifs.length).toBe(1);
      expect(notifs[0].data.quizId.toString()).toBe(closingQuiz._id.toString());
      expect(notifs[0].title).toMatch(/closing soon/i);
    }
  });

  test("skips a student who already submitted an attempt", async () => {
    const notifs = await Notification.find({ recipient: s3._id, type: "quiz_closing_soon" }).lean();
    expect(notifs.length).toBe(0);
  });
});
