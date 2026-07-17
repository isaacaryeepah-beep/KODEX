"use strict";

/**
 * Regression coverage for the DB index audit: each block below reproduces the
 * exact filter+sort shape of a real hot-path query that was previously an
 * unindexed (or partially-indexed) full/blocking scan, and asserts the new
 * index actually eliminates that -- via `.explain('executionStats')` against
 * a real MongoDB, not a guess about what the query planner "should" do.
 *
 * Two properties are checked per case:
 *   - no COLLSCAN anywhere in the winning plan (the collection was not
 *     fully scanned)
 *   - for filter+sort combos, no blocking in-memory SORT stage either (the
 *     new compound index satisfies the sort order directly -- this is the
 *     exact defect the audit found: an index existed for the filter, or for
 *     the sort, but never both together)
 *
 * Runs against a real MongoDB -- mongodb-memory-server in CI, or
 * TEST_MONGO_URI locally (see tests/routes/auth.test.js for the same
 * pattern). Indexes are NOT built automatically fast enough to trust
 * Mongoose's background autoIndex timing in a test run, so each model is
 * explicitly `.init()`'d (waits for index builds to finish) before any
 * query runs against it.
 */

jest.setTimeout(120000);

process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-index-suite-000000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-index-suite-0000001";
process.env.NODE_ENV           = "test";

const mongoose = require("mongoose");

let memoryServer = null;

const AttendanceSession    = require("../../src/models/AttendanceSession");
const AttendanceRecord     = require("../../src/models/AttendanceRecord");
const Course               = require("../../src/models/Course");
const CourseVideo          = require("../../src/models/CourseVideo");
const Quiz                 = require("../../src/models/Quiz");
const Assignment           = require("../../src/models/Assignment");
const AssignmentSubmission = require("../../src/models/AssignmentSubmission");

const MODELS = [
  AttendanceSession, AttendanceRecord, Course, CourseVideo, Quiz, Assignment, AssignmentSubmission,
];

// Walks the winningPlan's inputStage/inputStages chain and returns every
// distinct `.stage` value present (e.g. ["FETCH", "IXSCAN"] or ["COLLSCAN"]).
function collectStages(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.stage) out.push(node.stage);
  if (node.inputStage) collectStages(node.inputStage, out);
  if (Array.isArray(node.inputStages)) node.inputStages.forEach((s) => collectStages(s, out));
  return out;
}

async function explainStages(query) {
  const result = await query.explain("executionStats");
  return collectStages(result.queryPlanner.winningPlan);
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_indexcoverage_test");
  }
  await mongoose.connect(uri);

  await Promise.all(
    ["attendancesessions", "attendancerecords", "courses", "coursevideos", "quizzes", "assignments", "assignmentsubmissions"]
      .map((c) => mongoose.connection.db.collection(c).deleteMany({}).catch(() => {}))
  );

  // Wait for every new index to actually finish building before any test runs.
  await Promise.all(MODELS.map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

const oid = () => new mongoose.Types.ObjectId();

describe("AttendanceSession — new indexes", () => {
  const company = oid();
  const otherCompany = oid();
  const course = oid();
  const lecturer = oid();

  beforeAll(async () => {
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        company: i % 4 === 0 ? otherCompany : company,
        createdBy: lecturer,
        course: i % 3 === 0 ? course : oid(),
        status: i % 2 === 0 ? "active" : "ended",
        startedAt: new Date(Date.now() - i * 60000),
      });
    }
    await AttendanceSession.insertMany(docs);
  });

  test("course-scoped lookup ({company, course}) never full-scans", async () => {
    const stages = await explainStages(
      AttendanceSession.find({ company, course }).select("_id course").lean()
    );
    expect(stages).not.toContain("COLLSCAN");
  });

  test("auto-detect ({company, status} filtered, sorted by startedAt) avoids both COLLSCAN and a blocking in-memory SORT", async () => {
    const stages = await explainStages(
      AttendanceSession.findOne({ company, status: { $in: ["active", "live"] } }).sort({ startedAt: -1 })
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });

  test("lecturer recent-sessions widget ({company, createdBy} sorted by startedAt) avoids both COLLSCAN and SORT", async () => {
    const stages = await explainStages(
      AttendanceSession.find({ company, createdBy: lecturer }).sort({ startedAt: -1 }).limit(5).select("title status startedAt").lean()
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });
});

describe("AttendanceRecord — new indexes", () => {
  const company = oid();
  const deviceId = "device-under-test";
  const session = oid();

  beforeAll(async () => {
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        session: i === 0 ? session : oid(),
        user: oid(),
        company: i % 3 === 0 ? oid() : company,
        deviceId: i % 2 === 0 ? deviceId : `other-device-${i}`,
        checkInTime: new Date(Date.now() - i * 3600000),
      });
    }
    await AttendanceRecord.insertMany(docs);
  });

  test("per-mark device-lock check ({company, deviceId, user:$ne, checkInTime range}, sorted checkInTime) avoids COLLSCAN and SORT", async () => {
    const stages = await explainStages(
      AttendanceRecord.findOne({
        company,
        deviceId,
        user: { $ne: oid() },
        checkInTime: { $gt: new Date(Date.now() - 7 * 24 * 3600000) },
      }).sort({ checkInTime: -1 }).select("checkInTime user").lean()
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });

  test("30-day trend scan ({company, checkInTime range}) never full-scans", async () => {
    const stages = await explainStages(
      AttendanceRecord.find({
        company,
        checkInTime: { $gte: new Date(Date.now() - 30 * 24 * 3600000), $lte: new Date() },
      })
    );
    expect(stages).not.toContain("COLLSCAN");
  });
});

describe("Course — new index", () => {
  const companyId = oid();
  const createdBy = oid();

  beforeAll(async () => {
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        title: `Course ${i}`,
        code: `C${i}`,
        companyId: i % 4 === 0 ? oid() : companyId,
        createdBy,
        isActive: i % 2 === 0,
      });
    }
    await Course.insertMany(docs);
  });

  test("course-list page ({companyId, isActive} filtered, sorted by createdAt desc) avoids COLLSCAN and SORT", async () => {
    const stages = await explainStages(
      Course.find({ companyId, isActive: true }).sort({ createdAt: -1 }).skip(0).limit(10).lean()
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });
});

describe("CourseVideo — new index", () => {
  const companyId = oid();
  const courseId = oid();

  beforeAll(async () => {
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        courseId: i % 3 === 0 ? courseId : oid(),
        companyId: i % 4 === 0 ? oid() : companyId,
        addedBy: oid(),
        title: `Video ${i}`,
        url: `https://example.test/${i}`,
        embedUrl: `https://example.test/embed/${i}`,
        order: i,
      });
    }
    await CourseVideo.insertMany(docs);
  });

  test("'my-courses videos' ({companyId} filtered, sorted {courseId, order, createdAt}) avoids COLLSCAN and SORT", async () => {
    const stages = await explainStages(
      CourseVideo.find({ companyId }).sort({ courseId: 1, order: 1, createdAt: 1 }).populate("courseId").lean()
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });
});

describe("Quiz — new index", () => {
  const company = oid();
  const course = oid();

  beforeAll(async () => {
    const now = Date.now();
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        title: `Quiz ${i}`,
        course,
        company: i % 4 === 0 ? oid() : company,
        createdBy: oid(),
        isActive: i % 2 === 0,
        startTime: new Date(now - i * 3600000),
        endTime: new Date(now - i * 3600000 + 1800000),
      });
    }
    await Quiz.insertMany(docs);
  });

  test("legacy quiz-list ({company, isActive} filtered, sorted by startTime desc) avoids COLLSCAN and SORT", async () => {
    const stages = await explainStages(
      Quiz.find({ company, isActive: true }).sort({ startTime: -1 })
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });
});

describe("Assignment — new indexes", () => {
  const company = oid();
  const course = oid();

  beforeAll(async () => {
    const now = Date.now();
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        title: `Assignment ${i}`,
        course: i % 3 === 0 ? course : oid(),
        company: i % 4 === 0 ? oid() : company,
        createdBy: oid(),
        status: i % 2 === 0 ? "published" : "draft",
        releaseDate: new Date(now - 7 * 24 * 3600000),
        dueDate: new Date(now + i * 3600000),
      });
    }
    await Assignment.insertMany(docs);
  });

  test("lecturer/student 'due this week' widget ({company, course, status, dueDate range}, sorted dueDate) avoids COLLSCAN and SORT", async () => {
    const stages = await explainStages(
      Assignment.find({
        company,
        course,
        status: { $ne: "archived" },
        dueDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 3600000) },
      }).sort({ dueDate: 1 }).select("title dueDate").lean()
    );
    expect(stages).not.toContain("COLLSCAN");
    expect(stages).not.toContain("SORT");
  });

  test("admin due-soon count ({company, status, dueDate range}, no course filter) avoids COLLSCAN", async () => {
    const stages = await explainStages(
      Assignment.find({
        company,
        status: "published",
        dueDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 3600000) },
      })
    );
    expect(stages).not.toContain("COLLSCAN");
  });
});

describe("AssignmentSubmission — new index", () => {
  const company = oid();
  const student = oid();

  beforeAll(async () => {
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        assignment: oid(),
        student: i % 2 === 0 ? student : oid(),
        course: oid(),
        company: i % 4 === 0 ? oid() : company,
        status: i % 3 === 0 ? "submitted" : "graded",
      });
    }
    await AssignmentSubmission.insertMany(docs);
  });

  test("student dashboard submission count ({company, student, status}) avoids COLLSCAN", async () => {
    const stages = await explainStages(
      AssignmentSubmission.find({ company, student, status: { $in: ["submitted", "graded"] } })
    );
    expect(stages).not.toContain("COLLSCAN");
  });
});
