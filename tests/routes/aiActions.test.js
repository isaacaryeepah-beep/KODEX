"use strict";

/**
 * Integration tests for POST /api/ai-actions/chat — Dikly AI's tool-enabled
 * chat (Phase 1: read-only tools). The Anthropic SDK is mocked (true
 * external); everything else — auth, role gating, company scoping, the tool
 * handlers — runs against a real MongoDB.
 *
 * The mock is scripted per test via global.__anthropicCreate, letting a test
 * decide what the "model" asks for (including forged tool calls a real model
 * should never make) and then inspect exactly what data would have been fed
 * back to it.
 */

jest.setTimeout(120000);

const crypto = require("crypto");
const randSecret = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");
const randPassword = () => `Test${crypto.randomBytes(6).toString("hex")}!1`;

process.env.JWT_SECRET         = process.env.JWT_SECRET         || randSecret();
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || randSecret();
process.env.NODE_ENV           = "test";
process.env.ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY || "test-key-not-real";

jest.mock("@anthropic-ai/sdk", () =>
  jest.fn().mockImplementation(() => ({
    messages: { create: (...args) => global.__anthropicCreate(...args) },
  }))
);

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

const Company      = require("../../src/models/Company");
const User         = require("../../src/models/User");
const LeaveRequest = require("../../src/models/LeaveRequest");
const AttendanceSession = require("../../src/models/AttendanceSession");
const AuditLog     = require("../../src/models/AuditLog");
const { generateToken } = require("../../src/utils/jwt");

let acadCompany, corpCompany, otherCompany;
let acadAdmin, student, corpAdmin, corpEmployee;
let acadAdminToken, studentToken, corpAdminToken;

// Helpers to script the fake model.
const textTurn = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
const toolTurn = (name, input = {}) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "tu_" + name, name, input }],
});

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_aiactions_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "leaverequests"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  acadCompany = await Company.create({
    name: "AI Actions Uni", mode: "academic", institutionCode: "AIACT1",
    subscriptionActive: true, subscriptionStatus: "active",
  });
  corpCompany = await Company.create({
    name: "AI Actions Corp", mode: "corporate", institutionCode: "AIACT2",
    subscriptionActive: true, subscriptionStatus: "active",
  });
  otherCompany = await Company.create({
    name: "Other Uni", mode: "academic", institutionCode: "AIACT3",
    subscriptionActive: true, subscriptionStatus: "active",
  });

  const uniq = Date.now();
  acadAdmin = await User.create({
    name: "Acad Admin", email: `admin${uniq}@aiact.edu`, password: randPassword(),
    role: "admin", company: acadCompany._id, isActive: true, isApproved: true,
  });
  student = await User.create({
    name: "Plain Student", email: `stud${uniq}@aiact.edu`, password: randPassword(),
    role: "student", company: acadCompany._id, IndexNumber: `AI/${uniq}/1`,
    isActive: true, isApproved: true,
  });
  await User.create({
    name: "Locked Louis", email: `locked${uniq}@aiact.edu`, password: randPassword(),
    role: "student", company: acadCompany._id, IndexNumber: `AI/${uniq}/2`,
    isActive: true, isApproved: true, isLocked: true, lockReason: "Device mismatch",
  });
  await User.create({
    name: "Device Dora", email: `devlock${uniq}@aiact.edu`, password: randPassword(),
    role: "student", company: acadCompany._id, IndexNumber: `AI/${uniq}/3`,
    isActive: true, isApproved: true,
    accountDeviceLock: { isLocked: true, lockedAt: new Date(), lockedUntil: new Date(Date.now() + 3600e3) },
  });
  // Same name, DIFFERENT company — must never appear in results.
  await User.create({
    name: "Cross Tenant Carl", email: `cross${uniq}@other.edu`, password: randPassword(),
    role: "student", company: otherCompany._id, IndexNumber: `OT/${uniq}/1`,
    isActive: true, isApproved: true, isLocked: true, lockReason: "Should not leak",
  });

  corpAdmin = await User.create({
    name: "Corp Admin", email: `cadmin${uniq}@aiact.com`, password: randPassword(),
    role: "admin", company: corpCompany._id, isActive: true, isApproved: true,
  });
  corpEmployee = await User.create({
    name: "Ellen Employee", email: `emp${uniq}@aiact.com`, password: randPassword(),
    role: "employee", company: corpCompany._id, isActive: true, isApproved: true,
  });
  await LeaveRequest.create({
    company: corpCompany._id, employee: corpEmployee._id, type: "annual",
    startDate: new Date(Date.now() + 86400e3), endDate: new Date(Date.now() + 3 * 86400e3),
    days: 3, status: "pending", reason: "Family trip",
  });

  acadAdminToken = generateToken(acadAdmin._id);
  studentToken   = generateToken(student._id);
  corpAdminToken = generateToken(corpAdmin._id);
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("POST /api/ai-actions/chat", () => {
  test("admin question triggers a tool; reply and toolsUsed returned; data is company-scoped", async () => {
    const calls = [];
    global.__anthropicCreate = jest.fn(async (params) => {
      calls.push(params);
      return calls.length === 1
        ? toolTurn("list_locked_students")
        : textTurn("2 students are locked: Locked Louis and Device Dora.");
    });

    const res = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ question: "Who is locked out right now?" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/locked/i);
    expect(res.body.toolsUsed).toContain("list_locked_students");

    // The tool result fed back to the model must contain only own-company
    // students — never the cross-tenant one.
    const toolResultMsg = calls[1].messages.find(
      (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result")
    );
    const payload = toolResultMsg.content.find((c) => c.type === "tool_result").content;
    expect(payload).toContain("Locked Louis");
    expect(payload).toContain("Device Dora");
    expect(payload).not.toContain("Cross Tenant Carl");

    // Academic admin gets academic tools; corporate-only tools are absent.
    const offered = calls[0].tools.map((t) => t.name);
    expect(offered).toContain("list_locked_students");
    expect(offered).not.toContain("list_pending_leave_requests");
  });

  test("a forged tool call for a tool outside the caller's role returns an error result, not data", async () => {
    const calls = [];
    global.__anthropicCreate = jest.fn(async (params) => {
      calls.push(params);
      return calls.length === 1
        ? toolTurn("list_locked_students") // student is NOT allowed this tool
        : textTurn("Sorry, I can't access that.");
    });

    const res = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ question: "List all locked students" });

    expect(res.status).toBe(200);
    // No tool actually executed for the caller…
    expect(res.body.toolsUsed).toEqual([]);
    // …and the model received a refusal, with none of the real data.
    const toolResultMsg = calls[1].messages.find(
      (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result")
    );
    const payload = toolResultMsg.content.find((c) => c.type === "tool_result").content;
    expect(payload).toMatch(/not available/i);
    expect(payload).not.toContain("Locked Louis");
    // The student was never even offered tools.
    expect(calls[0].tools || []).toHaveLength(0);
  });

  test("corporate admin sees pending leave requests through the tool", async () => {
    const calls = [];
    global.__anthropicCreate = jest.fn(async (params) => {
      calls.push(params);
      return calls.length === 1
        ? toolTurn("list_pending_leave_requests")
        : textTurn("There is 1 pending leave request from Ellen Employee.");
    });

    const res = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${corpAdminToken}`)
      .send({ question: "Any leave requests waiting on me?" });

    expect(res.status).toBe(200);
    expect(res.body.toolsUsed).toContain("list_pending_leave_requests");
    const toolResultMsg = calls[1].messages.find(
      (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result")
    );
    const payload = toolResultMsg.content.find((c) => c.type === "tool_result").content;
    expect(payload).toContain("Ellen Employee");
    expect(payload).toContain('"count":1');
  });

  test("plain-knowledge question needs no tool and reports none used", async () => {
    global.__anthropicCreate = jest.fn(async () => textTurn("Attendance means being present."));
    const res = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ question: "What does attendance mean?" });
    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/present/);
    expect(res.body.toolsUsed).toEqual([]);
  });

  test("rejects a missing question", async () => {
    const res = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("rejects unauthenticated requests", async () => {
    const res = await request(app).post("/api/ai-actions/chat").send({ question: "hi" });
    expect(res.status).toBe(401);
  });

  test("returns 503 when no AI key is configured (frontend falls back)", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await request(app)
        .post("/api/ai-actions/chat")
        .set("Authorization", `Bearer ${acadAdminToken}`)
        .send({ question: "Who is locked?" });
      expect(res.status).toBe(503);
    } finally {
      process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe("Phase 2 — propose → confirm → execute", () => {
  test("unlock flow: proposal changes nothing; Confirm unlocks and audit-logs", async () => {
    const locked = await User.findOne({ name: "Locked Louis" }).lean();

    let n = 0;
    global.__anthropicCreate = jest.fn(async () =>
      ++n === 1
        ? toolTurn("propose_unlock_student", { studentId: String(locked._id) })
        : textTurn("Ready — tap Confirm to unlock Locked Louis.")
    );

    const chat = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ question: "Unlock Locked Louis please" });

    expect(chat.status).toBe(200);
    expect(chat.body.pendingAction).toBeTruthy();
    expect(chat.body.pendingAction.summary).toContain("Locked Louis");
    expect(typeof chat.body.pendingAction.token).toBe("string");

    // Proposing must not have changed the database.
    let inDb = await User.findById(locked._id).lean();
    expect(inDb.isLocked).toBe(true);

    // Confirm executes.
    const exec = await request(app)
      .post("/api/ai-actions/execute")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ token: chat.body.pendingAction.token });

    expect(exec.status).toBe(200);
    expect(exec.body.message).toMatch(/unlocked/i);

    inDb = await User.findById(locked._id).lean();
    expect(inDb.isLocked).toBe(false);
    expect(inDb.lockReason).toBeNull();
    expect(inDb.lastLogoutTime).toBeNull();

    // Audit trail carries the via-Dikly-AI marker (fire-and-forget write).
    await new Promise((r) => setTimeout(r, 300));
    const audit = await AuditLog.findOne({ resourceId: locked._id, "metadata.viaDiklyAI": true }).lean();
    expect(audit).toBeTruthy();
  });

  test("a proposal token cannot be executed by a different user", async () => {
    const dora = await User.findOne({ name: "Device Dora" }).lean();
    let n = 0;
    global.__anthropicCreate = jest.fn(async () =>
      ++n === 1
        ? toolTurn("propose_unlock_student", { studentId: String(dora._id) })
        : textTurn("Ready.")
    );
    const chat = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ question: "Unlock Device Dora" });
    expect(chat.body.pendingAction).toBeTruthy();

    // The STUDENT tries to replay the admin's token.
    const exec = await request(app)
      .post("/api/ai-actions/execute")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ token: chat.body.pendingAction.token });
    expect(exec.status).toBe(400);
    expect(exec.body.error).toMatch(/different user/i);
    const inDb = await User.findById(dora._id).lean();
    expect(inDb.accountDeviceLock.isLocked).toBe(true);
  });

  test("a tampered token is rejected", async () => {
    const res = await request(app)
      .post("/api/ai-actions/execute")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ token: "aaaa.bbbb" });
    expect(res.status).toBe(400);
  });

  test("an expired token is rejected", async () => {
    const crypto2 = require("crypto");
    const payload = Buffer.from(JSON.stringify({
      a: "unlock_student",
      p: { studentId: String(student._id) },
      u: String(acadAdmin._id),
      c: String(acadCompany._id),
      exp: Date.now() - 1000,
    })).toString("base64url");
    const sig = crypto2.createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
    const res = await request(app)
      .post("/api/ai-actions/execute")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ token: `${payload}.${sig}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  test("leave decision flow: approve via Confirm sets status and reviewer", async () => {
    const leave = await LeaveRequest.findOne({ status: "pending" }).lean();
    let n = 0;
    global.__anthropicCreate = jest.fn(async () =>
      ++n === 1
        ? toolTurn("propose_leave_decision", { leaveRequestId: String(leave._id), decision: "approved" })
        : textTurn("Ready — confirm to approve.")
    );
    const chat = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${corpAdminToken}`)
      .send({ question: "Approve Ellen's leave" });
    expect(chat.body.pendingAction.summary).toMatch(/approve/i);

    const exec = await request(app)
      .post("/api/ai-actions/execute")
      .set("Authorization", `Bearer ${corpAdminToken}`)
      .send({ token: chat.body.pendingAction.token });
    expect(exec.status).toBe(200);

    const after = await LeaveRequest.findById(leave._id).lean();
    expect(after.status).toBe("approved");
    expect(String(after.reviewedBy)).toBe(String(corpAdmin._id));
  });

  test("extend session flow: Confirm adds minutes to the caller's running session", async () => {
    const session = await AttendanceSession.create({
      company: acadCompany._id, createdBy: acadAdmin._id, title: "AI Extend Test",
      status: "active", startedAt: new Date(), durationSeconds: 300,
    });
    let n = 0;
    global.__anthropicCreate = jest.fn(async () =>
      ++n === 1
        ? toolTurn("propose_extend_session", { addMinutes: 15 })
        : textTurn("Ready — confirm to add 15 minutes.")
    );
    const chat = await request(app)
      .post("/api/ai-actions/chat")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ question: "Add 15 minutes to my session" });
    expect(chat.body.pendingAction.summary).toContain("15 minutes");

    const exec = await request(app)
      .post("/api/ai-actions/execute")
      .set("Authorization", `Bearer ${acadAdminToken}`)
      .send({ token: chat.body.pendingAction.token });
    expect(exec.status).toBe(200);

    const after = await AttendanceSession.findById(session._id).lean();
    expect(after.durationSeconds).toBeGreaterThanOrEqual(1190); // 300 + 900, minus clock skew tolerance
    await AttendanceSession.deleteOne({ _id: session._id });
  });
});
