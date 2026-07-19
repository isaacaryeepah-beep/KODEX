"use strict";

/**
 * Integration tests for the real, wired assignment flow: a lecturer creates
 * an assignment via POST /api/assignments/lecturer, and a student discovers
 * it via GET /api/assignments/student (the list a student browses) then
 * opens it via GET /api/assignments/student/:id (what a notification link —
 * /assignments.html?id=<assignmentId> — or a click from that list hits).
 *
 * Written to reproduce a reported "Assignment not found" error a student
 * hit opening an assignment. No test existed for this flow before. Runs
 * against the real Express app + real MongoDB, same as every other suite.
 */

jest.setTimeout(120000);

const crypto = require("crypto");
// Random per-run values, not literals — avoids hardcoded-credential security
// scans flagging fixture strings that merely look like real secrets.
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
const Course  = require("../../src/models/Course");

const INSTITUTION_CODE = "ASGNFLOW1";
const LECTURER_EMAIL    = "lecturer@asgnflow.edu";
const LECTURER_PASSWORD = randPassword();
const STUDENT_EMAIL     = "student@asgnflow.edu";
const STUDENT_PASSWORD  = randPassword();
const GROUP_B_EMAIL     = "groupb@asgnflow.edu";
const GROUP_B_PASSWORD  = randPassword();

let company, lecturer, student, groupBStudent, course;
let lecturerToken, studentToken, groupBToken;

async function loginAs(email, password) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_asgnflow_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "courses", "assignments", "assignmentsubmissions"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  company = await Company.create({
    name: "Assignment Flow Test University",
    mode: "academic",
    institutionCode: INSTITUTION_CODE,
    selfRegistrationEnabled: true,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  lecturer = await User.create({
    name: "Prof. Assignment Flow",
    email: LECTURER_EMAIL,
    password: LECTURER_PASSWORD,
    role: "lecturer",
    company: company._id,
    department: "Computer Science",
    isActive: true,
    isApproved: true,
  });

  student = await User.create({
    name: "Ama Student",
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
    role: "student",
    company: company._id,
    IndexNumber: "ASGNFLOW/CS/26/0001",
    studentGroup: "A",
    isActive: true,
    isApproved: true,
  });

  groupBStudent = await User.create({
    name: "Kofi GroupB",
    email: GROUP_B_EMAIL,
    password: GROUP_B_PASSWORD,
    role: "student",
    company: company._id,
    IndexNumber: "ASGNFLOW/CS/26/0002",
    studentGroup: "B",
    isActive: true,
    isApproved: true,
  });

  course = await Course.create({
    title: "Software Engineering",
    code: "CSCD401",
    companyId: company._id,
    lecturerId: lecturer._id,
    createdBy: lecturer._id,
    enrolledStudents: [student._id, groupBStudent._id],
  });

  lecturerToken = await loginAs(LECTURER_EMAIL, LECTURER_PASSWORD);
  studentToken  = await loginAs(STUDENT_EMAIL, STUDENT_PASSWORD);
  groupBToken   = await loginAs(GROUP_B_EMAIL, GROUP_B_PASSWORD);
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

function assignmentPayload(overrides = {}) {
  const releaseDate = new Date(Date.now() - 60 * 60 * 1000); // 1h ago — already released
  const dueDate      = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days out
  return {
    title: "Essay on Distributed Systems",
    description: "Write a 2000-word essay.",
    courseId: String(course._id),
    releaseDate: releaseDate.toISOString(),
    dueDate: dueDate.toISOString(),
    ...overrides,
  };
}

describe("Assignment: create → list → open (the real wired flow)", () => {
  let assignmentId;

  test("lecturer creates an assignment (targetAudience: 'all')", async () => {
    const res = await request(app)
      .post("/api/assignments/lecturer")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send(assignmentPayload());

    expect(res.status).toBe(201);
    expect(res.body.assignment.status).toBe("published");
    expect(res.body.assignment.isPublished).toBe(true);
    assignmentId = res.body.assignment._id;
  });

  test("the enrolled student sees it in their assignment list", async () => {
    const res = await request(app)
      .get("/api/assignments/student")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.assignments.map((a) => a._id);
    expect(ids).toContain(assignmentId);
  });

  test("the enrolled student can open it directly by ID (the notification-link path) — must NOT 404", async () => {
    const res = await request(app)
      .get(`/api/assignments/student/${assignmentId}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.assignment.title).toBe("Essay on Distributed Systems");
  });
});

describe("Assignment: group-targeted assignments", () => {
  let groupAssignmentId;

  test("lecturer creates an assignment targeted at group 'A' only", async () => {
    const res = await request(app)
      .post("/api/assignments/lecturer")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send(assignmentPayload({
        title: "Group A Lab Report",
        targetAudience: "group",
        targetGroup: "A",
      }));

    expect(res.status).toBe(201);
    groupAssignmentId = res.body.assignment._id;
  });

  test("the matching-group student sees it in their list and can open it", async () => {
    const listRes = await request(app)
      .get("/api/assignments/student")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.assignments.map((a) => a._id)).toContain(groupAssignmentId);

    const getRes = await request(app)
      .get(`/api/assignments/student/${groupAssignmentId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(getRes.status).toBe(200);
  });

  test("a different-group student does NOT see it in their list", async () => {
    const res = await request(app)
      .get("/api/assignments/student")
      .set("Authorization", `Bearer ${groupBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.assignments.map((a) => a._id)).not.toContain(groupAssignmentId);
  });

  test("a different-group student opening it directly gets 403 (not found), never a bare 404 'not found' for a real assignment they're enrolled in the course for", async () => {
    const res = await request(app)
      .get(`/api/assignments/student/${groupAssignmentId}`)
      .set("Authorization", `Bearer ${groupBToken}`);
    // Enrolled in the course, but wrong group — the controller must distinguish
    // this from "doesn't exist" (404) so the student isn't told a real,
    // just-announced assignment doesn't exist.
    expect(res.status).toBe(403);
  });
});

describe("Assignment: not-yet-released assignment", () => {
  test("an assignment with a future releaseDate is invisible to students (list + direct open)", async () => {
    const createRes = await request(app)
      .post("/api/assignments/lecturer")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send(assignmentPayload({
        title: "Future Assignment",
        releaseDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      }));
    expect(createRes.status).toBe(201);
    const futureId = createRes.body.assignment._id;

    const listRes = await request(app)
      .get("/api/assignments/student")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(listRes.body.assignments.map((a) => a._id)).not.toContain(futureId);

    const getRes = await request(app)
      .get(`/api/assignments/student/${futureId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(getRes.status).toBe(404);
  });
});
