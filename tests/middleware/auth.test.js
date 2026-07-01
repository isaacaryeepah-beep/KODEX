"use strict";
jest.mock("../../src/models/User");
jest.mock("../../src/utils/jwt");

const User = require("../../src/models/User");
const { verifyToken } = require("../../src/utils/jwt");
const authenticate = require("../../src/middleware/auth");

function makeReq(token, path = "/api/users") {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query: {},
    originalUrl: path,
    url: path,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

const mockUser = {
  _id: "user123",
  isActive: true,
  isLocked: false,
  isSuspended: false,
  // superadmin skips all subscription checks so tests stay focused on auth logic
  role: "superadmin",
  company: "company123",
  maxTimeMS: jest.fn().mockReturnThis(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authenticate middleware", () => {
  test("rejects request with no token", async () => {
    const req = makeReq(null);
    const res = makeRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects invalid token with JWT error", async () => {
    const jwtErr = new Error("invalid signature");
    jwtErr.name = "JsonWebTokenError";
    verifyToken.mockImplementation(() => { throw jwtErr; });
    const req = makeReq("bad-token");
    const res = makeRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects expired token", async () => {
    const expErr = new Error("jwt expired");
    expErr.name = "TokenExpiredError";
    verifyToken.mockImplementation(() => { throw expErr; });
    const req = makeReq("expired-token");
    const res = makeRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Token expired" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects inactive user", async () => {
    verifyToken.mockReturnValue({ id: "user123" });
    User.findById = jest.fn().mockReturnValue({ maxTimeMS: jest.fn().mockResolvedValue({ ...mockUser, isActive: false }) });
    const req = makeReq("valid-token");
    const res = makeRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects locked user with accountLocked flag", async () => {
    verifyToken.mockReturnValue({ id: "user123" });
    User.findById = jest.fn().mockReturnValue({
      maxTimeMS: jest.fn().mockResolvedValue({ ...mockUser, isLocked: true, lockReason: "Policy violation" }),
    });
    const req = makeReq("valid-token");
    const res = makeRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accountLocked: true }));
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next() for valid active user and attaches user to req", async () => {
    verifyToken.mockReturnValue({ id: "user123" });
    User.findById = jest.fn().mockReturnValue({ maxTimeMS: jest.fn().mockResolvedValue(mockUser) });
    const req = makeReq("valid-token");
    const res = makeRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBe(mockUser);
  });
});
