"use strict";

/**
 * Integration tests for the admin API-key management routes
 * (/api/api-keys) — specifically the mode-scoping added after a user
 * report: an academic institution's API Access page offered corporate
 * scopes (attendance/employees/leaves/shifts) alongside academic ones.
 * The scope list an admin sees, and the scopes a key can be created
 * with, must now match the company's mode.
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

const CORPORATE_SCOPES = ["read:attendance", "read:employees", "read:leaves", "read:shifts"];
const ACADEMIC_SCOPES  = ["read:students", "read:courses"];

const ADMIN_PASSWORD = randPassword();

let academicToken, corporateToken, bothToken;

async function seedCompanyWithAdmin(name, mode, code, email) {
  const company = await Company.create({
    name,
    mode,
    institutionCode: code,
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  await User.create({
    name: `${mode} Admin`,
    email,
    password: ADMIN_PASSWORD,
    role: "admin",
    company: company._id,
    isActive: true,
    isApproved: true,
  });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email, password: ADMIN_PASSWORD });
  expect(login.status).toBe(200);
  return login.body.token;
}

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_apikeys_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies", "apikeys"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  academicToken  = await seedCompanyWithAdmin("Keys Academic Uni", "academic", "KEYSACAD1", "admin@keysacad.edu");
  corporateToken = await seedCompanyWithAdmin("Keys Corporate Ltd", "corporate", "KEYSCORP1", "admin@keyscorp.com");
  bothToken      = await seedCompanyWithAdmin("Keys Hybrid Org", "both", "KEYSBOTH1", "admin@keysboth.org");
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("GET /api/api-keys — scope list follows company mode", () => {
  test("academic company sees ONLY academic scopes (and its mode)", async () => {
    const res = await request(app).get("/api/api-keys").set("Authorization", `Bearer ${academicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scopes).toEqual(ACADEMIC_SCOPES);
    expect(res.body.mode).toBe("academic");
  });

  test("corporate company sees ONLY corporate scopes", async () => {
    const res = await request(app).get("/api/api-keys").set("Authorization", `Bearer ${corporateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scopes).toEqual(CORPORATE_SCOPES);
    expect(res.body.mode).toBe("corporate");
  });

  test("'both'-mode company sees all six scopes", async () => {
    const res = await request(app).get("/api/api-keys").set("Authorization", `Bearer ${bothToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scopes).toEqual([...CORPORATE_SCOPES, ...ACADEMIC_SCOPES]);
    expect(res.body.mode).toBe("both");
  });
});

describe("POST /api/api-keys — scope grants are mode-enforced server-side", () => {
  test("academic company can create a key with academic scopes", async () => {
    const res = await request(app)
      .post("/api/api-keys")
      .set("Authorization", `Bearer ${academicToken}`)
      .send({ name: "Academic integration", scopes: ["read:students"] });
    expect(res.status).toBe(201);
    expect(res.body.key.scopes).toEqual(["read:students"]);
  });

  test("academic company is REJECTED when requesting a corporate scope (not silently filtered)", async () => {
    const res = await request(app)
      .post("/api/api-keys")
      .set("Authorization", `Bearer ${academicToken}`)
      .send({ name: "Sneaky key", scopes: ["read:students", "read:attendance"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/read:attendance/);
  });

  test("corporate company is rejected when requesting an academic scope", async () => {
    const res = await request(app)
      .post("/api/api-keys")
      .set("Authorization", `Bearer ${corporateToken}`)
      .send({ name: "Sneaky key", scopes: ["read:courses"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/read:courses/);
  });

  test("'both'-mode company can mix corporate and academic scopes on one key", async () => {
    const res = await request(app)
      .post("/api/api-keys")
      .set("Authorization", `Bearer ${bothToken}`)
      .send({ name: "Hybrid integration", scopes: ["read:attendance", "read:students"] });
    expect(res.status).toBe(201);
    expect(res.body.key.scopes).toEqual(["read:attendance", "read:students"]);
  });
});
