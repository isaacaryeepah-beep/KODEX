"use strict";

/**
 * Lecturer saved class locations (multi-campus GPS sessions):
 * GET/POST/DELETE /api/users/me/class-locations.
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

const PASSWORD = randPassword();
let companyId, lecturerId, lecturerToken, studentToken;

beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("dikly_class_locations_test");
  }
  await mongoose.connect(uri);
  ({ app } = require("../../src/server"));

  await Promise.all(
    ["users", "companies"].map((c) =>
      mongoose.connection.db.collection(c).deleteMany({}).catch(() => {})
    )
  );

  const company = await Company.create({
    name: "Class Locations Uni",
    mode: "academic",
    institutionCode: "CLSLOC1",
    subscriptionActive: true,
    subscriptionStatus: "active",
  });
  companyId = company._id;

  const lecturer = await User.create({
    name: "Multi Campus Lecturer", email: "lect@clsloc.edu", password: PASSWORD,
    role: "lecturer", company: companyId, department: "CS", isActive: true, isApproved: true,
  });
  lecturerId = lecturer._id;

  const uniq = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  await User.create({
    name: "Some Student", email: `stud${uniq}@clsloc.edu`, IndexNumber: `CL/${uniq}`,
    password: PASSWORD, role: "student", company: companyId, isActive: true, isApproved: true,
  });

  const lecLogin = await request(app).post("/api/auth/login")
    .send({ email: "lect@clsloc.edu", password: PASSWORD, loginRole: "lecturer" });
  expect(lecLogin.status).toBe(200);
  lecturerToken = lecLogin.body.token;

  const stuLogin = await request(app).post("/api/auth/login")
    .send({ email: `stud${uniq}@clsloc.edu`, password: PASSWORD, loginRole: "student" });
  expect(stuLogin.status).toBe(200);
  studentToken = stuLogin.body.token;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
});

describe("/api/users/me/class-locations", () => {
  test("starts empty, add saves and returns the location", async () => {
    const empty = await request(app)
      .get("/api/users/me/class-locations")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.locations).toEqual([]);

    const add = await request(app)
      .post("/api/users/me/class-locations")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ name: "Main Campus – LT1", latitude: 5.6037, longitude: -0.187, radiusMeters: 100 });
    expect(add.status).toBe(201);
    expect(add.body.locations).toHaveLength(1);
    expect(add.body.locations[0].name).toBe("Main Campus – LT1");

    const list = await request(app)
      .get("/api/users/me/class-locations")
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(list.body.locations).toHaveLength(1);
  });

  test("rejects a missing name, bad coordinates, and out-of-range radius", async () => {
    const cases = [
      { latitude: 5, longitude: 0, radiusMeters: 100 },                              // no name
      { name: "X", latitude: 200, longitude: 0, radiusMeters: 100 },                 // bad lat
      { name: "X", latitude: 5, longitude: -999, radiusMeters: 100 },                // bad lng
      { name: "X", latitude: 5, longitude: 0, radiusMeters: 5 },                     // radius too small
      { name: "X", latitude: 5, longitude: 0, radiusMeters: 5000 },                  // radius too big
    ];
    for (const body of cases) {
      const r = await request(app)
        .post("/api/users/me/class-locations")
        .set("Authorization", `Bearer ${lecturerToken}`)
        .send(body);
      expect(r.status).toBe(400);
    }
  });

  test("delete removes the location; deleting again 404s", async () => {
    const list = await request(app)
      .get("/api/users/me/class-locations")
      .set("Authorization", `Bearer ${lecturerToken}`);
    const locId = list.body.locations[0]._id;

    const del = await request(app)
      .delete(`/api/users/me/class-locations/${locId}`)
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(del.status).toBe(200);
    expect(del.body.locations).toHaveLength(0);

    const again = await request(app)
      .delete(`/api/users/me/class-locations/${locId}`)
      .set("Authorization", `Bearer ${lecturerToken}`);
    expect(again.status).toBe(404);
  });

  test("caps the list at 12 locations", async () => {
    await User.findByIdAndUpdate(lecturerId, {
      savedClassLocations: Array.from({ length: 12 }, (_, i) => ({
        name: `Spot ${i + 1}`, latitude: 5 + i * 0.01, longitude: -0.1, radiusMeters: 100,
      })),
    });

    const r = await request(app)
      .post("/api/users/me/class-locations")
      .set("Authorization", `Bearer ${lecturerToken}`)
      .send({ name: "One too many", latitude: 5.9, longitude: -0.1, radiusMeters: 100 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/up to 12/);
  });

  test("students cannot use the endpoints", async () => {
    const r = await request(app)
      .get("/api/users/me/class-locations")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(r.status).toBe(403);
  });
});
