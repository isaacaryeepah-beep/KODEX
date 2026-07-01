"use strict";
const { loginLimiter, apiLimiter } = require("../../src/middleware/rateLimiter");

function makeReq(ip = "1.2.3.4", path = "/api/auth/login") {
  return { ip, originalUrl: path, url: path, headers: {} };
}

function makeRes() {
  const res = {};
  res.status    = jest.fn().mockReturnValue(res);
  res.json      = jest.fn().mockReturnValue(res);
  res.set       = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe("loginLimiter", () => {
  test("allows requests under the limit", () => {
    const req  = makeReq("10.0.0.1");
    const res  = makeRes();
    const next = jest.fn();

    loginLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("blocks the same IP after exceeding login limit", () => {
    const ip = "10.0.0.2";
    const res = makeRes();
    const next = jest.fn();

    // loginLimiter allows 10 per 15 min — hammer it 11 times
    for (let i = 0; i < 11; i++) {
      next.mockClear();
      res.status.mockClear();
      loginLimiter(makeReq(ip), res, next);
    }

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("apiLimiter", () => {
  test("allows requests under the global limit", () => {
    const req  = makeReq("10.0.0.3", "/api/users");
    const res  = makeRes();
    const next = jest.fn();

    apiLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
