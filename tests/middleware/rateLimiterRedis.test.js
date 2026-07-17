"use strict";

/**
 * Redis-backed path of the rate limiter (Phase 5 scalability work). The
 * no-Redis path is already covered by tests/middleware/rateLimiter.test.js
 * and deliberately untouched by this file -- these tests specifically
 * exercise the INCR/EXPIRE logic and the fallback-to-in-memory behavior
 * when Redis errors mid-request, using a mocked ioredis client (same
 * convention as tests/services/cacheService.test.js).
 */

jest.mock("ioredis", () => {
  const mockRedisInstance = {
    get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn(),
    incr: jest.fn(), expire: jest.fn(), ttl: jest.fn(),
    on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined),
  };
  const Ctor = jest.fn(() => mockRedisInstance);
  Ctor.__mockInstance = mockRedisInstance;
  return Ctor;
});

jest.mock("../../src/services/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

function freshRateLimiter() {
  jest.resetModules();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  const Redis = require("ioredis");
  const rateLimiter = require("../../src/middleware/rateLimiter");
  return { rateLimiter, mockRedis: Redis.__mockInstance };
}

function makeReq(ip = "1.2.3.4", path = "/api/auth/login") {
  return { ip, originalUrl: path, url: path, headers: {}, socket: { remoteAddress: ip } };
}

function makeRes() {
  const res = {};
  res.status    = jest.fn().mockReturnValue(res);
  res.json      = jest.fn().mockReturnValue(res);
  res.set       = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

// The limiter's Redis branch is a promise chain (incr -> maybe expire ->
// respond); give it a real tick to resolve before asserting.
const flush = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => {
  delete process.env.REDIS_URL;
});

describe("rateLimiter — Redis-backed path", () => {
  test("under the limit: increments the key and calls next()", async () => {
    const { rateLimiter, mockRedis } = freshRateLimiter();
    mockRedis.incr.mockResolvedValueOnce(1);
    mockRedis.expire.mockResolvedValueOnce(1);

    const req = makeReq("10.1.0.1");
    const res = makeRes();
    const next = jest.fn();

    rateLimiter.loginLimiter(req, res, next);
    await flush();

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining("rl:10.1.0.1"));
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining("rl:10.1.0.1"), 15 * 60);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("only sets expiry on the first increment of a window, not subsequent ones", async () => {
    const { rateLimiter, mockRedis } = freshRateLimiter();
    mockRedis.incr.mockResolvedValueOnce(2); // not the first hit in this window

    const req = makeReq("10.1.0.2");
    const res = makeRes();
    const next = jest.fn();

    rateLimiter.loginLimiter(req, res, next);
    await flush();

    expect(mockRedis.expire).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test("over the limit: returns 429 with Retry-After from the key's TTL", async () => {
    const { rateLimiter, mockRedis } = freshRateLimiter();
    mockRedis.incr.mockResolvedValueOnce(11); // loginLimiter max is 10
    mockRedis.ttl.mockResolvedValueOnce(842);

    const req = makeReq("10.1.0.3");
    const res = makeRes();
    const next = jest.fn();

    rateLimiter.loginLimiter(req, res, next);
    await flush();

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 842);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ retryAfter: 842 }));
    expect(next).not.toHaveBeenCalled();
  });

  test("a Redis error falls back to the in-memory limiter instead of failing the request", async () => {
    const { rateLimiter, mockRedis } = freshRateLimiter();
    mockRedis.incr.mockRejectedValueOnce(new Error("ECONNRESET"));

    const req = makeReq("10.1.0.4");
    const res = makeRes();
    const next = jest.fn();

    rateLimiter.loginLimiter(req, res, next);
    await flush();

    // Redis failed, but the in-memory fallback still allows a first hit through.
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("passwordResetLimiter keys by identifier, not IP -- two different IPs with the same email share one counter", async () => {
    const { rateLimiter, mockRedis } = freshRateLimiter();
    mockRedis.incr.mockResolvedValueOnce(1);
    mockRedis.expire.mockResolvedValueOnce(1);

    const req = { ...makeReq("10.1.0.5", "/api/auth/forgot-password"), body: { email: "shared@test.edu" } };
    const res = makeRes();
    const next = jest.fn();

    rateLimiter.passwordResetLimiter(req, res, next);
    await flush();

    expect(mockRedis.incr).toHaveBeenCalledWith("rl:pwr::shared@test.edu");
    expect(next).toHaveBeenCalled();
  });

  test("passwordResetLimiter with no identifier skips Redis entirely and calls next()", async () => {
    const { rateLimiter, mockRedis } = freshRateLimiter();
    const req = { ...makeReq("10.1.0.6", "/api/auth/forgot-password"), body: {} };
    const res = makeRes();
    const next = jest.fn();

    rateLimiter.passwordResetLimiter(req, res, next);
    await flush();

    expect(mockRedis.incr).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
