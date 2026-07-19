"use strict";

/**
 * Integration tests for /api/advanced/branding after opening it to all
 * modes. Previously the whole advanced.js router's corporate mode-gate
 * covered branding too, which 403'd academic institutions — hiding the
 * settings page AND silently disabling branding display (applyBranding()
 * fetches this endpoint on every dashboard load, any role, any mode).
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

const Company = require("../../src/models/Company");
const User    = require("../../src/models/User");

const ADMIN_PASSWORD = randPassword();
const LECTURER_PASSWORD = randPassword();

let adminToken, lecturerToken;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_branding_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  const company = await Company.create({
    name: "Branding Academic Uni",
    mode: "academic",
    institutionCode: "BRANDACAD1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });

  await User.create({
    name: "Branding Admin",
    email: "admin@brandacad.edu",
    password: ADMIN_PASSWORD,
    role: "admin",
    company: company._id,
    isActive: true,
    isApproved: true,
  });
  await User.create({
    name: "Branding Lecturer",
    email: "lecturer@brandacad.edu",
    password: LECTURER_PASSWORD,
    role: "lecturer",
    company: company._id,
    department: "CS",
    isActive: true,
    isApproved: true,
  });

  const adminLogin = await request(app).post("/api/auth/login")
    .send({ email: "admin@brandacad.edu", password: ADMIN_PASSWORD });
  expect(adminLogin.status).toBe(200);
  adminToken = adminLogin.body.token;

  const lecturerLogin = await request(app).post("/api/auth/login")
    .send({ email: "lecturer@brandacad.edu", password: LECTURER_PASSWORD, loginRole: "lecturer" });
  expect(lecturerLogin.status).toBe(200);
  lecturerToken = lecturerLogin.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("/api/advanced/branding — open to academic mode", () => {
  test("academic admin can read branding (previously 403 corporate_only)", async () => {
    const res = await request(app)
      .get("/api/advanced/branding")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("Branding Academic Uni");
  });

  test("academic admin can update branding", async () => {
    const res = await request(app)
      .patch("/api/advanced/branding")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ primaryColor: "#4f6ef7", companyTagline: "Learn boldly" });
    expect(res.status).toBe(200);
    expect(res.body.branding.primaryColor).toBe("#4f6ef7");
    expect(res.body.branding.companyTagline).toBe("Learn boldly");
  });

  test("a non-admin academic user can READ branding (applyBranding runs for every role) but not update it", async () => {
    const read = await request(app)
      .get("/api/advanced/branding")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(read.status).toBe(200);

    const write = await request(app)
      .patch("/api/advanced/branding")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ primaryColor: "#000000" });
    expect(write.status).toBe(403);
  });

  test("a corporate-only route (GET /api/advanced/branches) still rejects academic mode", async () => {
    // Use the lecturer, not the admin: requireMode() exempts admin/superadmin
    // entirely (see middleware/role.js), so an academic admin reaches every
    // mode-gated route regardless. A non-admin academic user is what the
    // corporate mode gate actually blocks — proving the gate is still in
    // place on /branches (i.e. the branding change didn't over-open it).
    const res = await request(app)
      .get("/api/advanced/branches")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(res.status).toBe(403);
  });
});
