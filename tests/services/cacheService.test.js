"use strict";

/**
 * Pure unit tests for the Redis caching wrapper (src/services/cacheService.js).
 * No real Redis, no MongoDB -- ioredis is mocked at the module boundary
 * (same convention as tests/routes/auth.test.js's emailService mock), so
 * these assert the actual contract that matters for a caching layer:
 * hit/miss behavior, and -- most importantly -- that any Redis failure
 * falls through to the caller's fetch function instead of breaking the
 * request. Caching must never be able to make something that used to work
 * start failing.
 */

jest.mock("ioredis", () => {
  const mockRedisInstance = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  };
  const Ctor = jest.fn(() => mockRedisInstance);
  Ctor.__mockInstance = mockRedisInstance;
  return Ctor;
});

jest.mock("../../src/services/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

function freshCacheService(redisUrl) {
  jest.resetModules();
  if (redisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = redisUrl;

  const Redis = require("ioredis");
  const cacheService = require("../../src/services/cacheService");
  return { cacheService, mockRedis: Redis.__mockInstance };
}

describe("cacheService — Redis configured", () => {
  test("cache miss calls fetchFn and stores the result", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce("OK");

    const fetchFn = jest.fn().mockResolvedValue({ totals: { students: 42 } });
    const result = await cacheService.getOrSetCache("dash:academic:co1", 30, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ totals: { students: 42 } });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "dash:academic:co1",
      JSON.stringify({ totals: { students: 42 } }),
      "EX",
      30
    );
  });

  test("cache hit returns the parsed cached value and never calls fetchFn", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ totals: { students: 99 } }));

    const fetchFn = jest.fn().mockResolvedValue({ totals: { students: 1 } });
    const result = await cacheService.getOrSetCache("dash:academic:co1", 30, fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ totals: { students: 99 } });
  });

  test("a GET error falls through to fetchFn instead of throwing", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.get.mockRejectedValueOnce(new Error("connection reset"));

    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const result = await cacheService.getOrSetCache("dash:academic:co1", 30, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  test("a SET error is swallowed -- the fetched value is still returned", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockRejectedValueOnce(new Error("write failed"));

    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const result = await cacheService.getOrSetCache("dash:academic:co1", 30, fetchFn);

    expect(result).toEqual({ ok: true });
  });

  test("invalidateCache deletes the key", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.del.mockResolvedValueOnce(1);

    await cacheService.invalidateCache("dash:employee:co1:u1");

    expect(mockRedis.del).toHaveBeenCalledWith("dash:employee:co1:u1");
  });

  test("invalidateCache does not throw when Redis errors", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.del.mockRejectedValueOnce(new Error("down"));

    await expect(cacheService.invalidateCache("dash:employee:co1:u1")).resolves.toBeUndefined();
  });

  test("invalidatePattern deletes every matching key", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.keys.mockResolvedValueOnce(["dash:academic:co1", "dash:corporate:co1"]);
    mockRedis.del.mockResolvedValueOnce(2);

    await cacheService.invalidatePattern("dash:");

    expect(mockRedis.keys).toHaveBeenCalledWith("dash:*");
    expect(mockRedis.del).toHaveBeenCalledWith("dash:academic:co1", "dash:corporate:co1");
  });

  test("invalidatePattern is a no-op when nothing matches", async () => {
    const { cacheService, mockRedis } = freshCacheService("redis://127.0.0.1:6379");
    mockRedis.keys.mockResolvedValueOnce([]);

    await cacheService.invalidatePattern("dash:");

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  test("isEnabled() is true when REDIS_URL is set", () => {
    const { cacheService } = freshCacheService("redis://127.0.0.1:6379");
    expect(cacheService.isEnabled()).toBe(true);
  });
});

describe("cacheService — REDIS_URL not set (caching disabled)", () => {
  test("getOrSetCache calls fetchFn directly, no Redis client is constructed", async () => {
    const { cacheService } = freshCacheService(undefined);
    const Redis = require("ioredis");

    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const result = await cacheService.getOrSetCache("dash:academic:co1", 30, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
    expect(Redis).not.toHaveBeenCalled();
  });

  test("invalidateCache and invalidatePattern are silent no-ops", async () => {
    const { cacheService } = freshCacheService(undefined);
    await expect(cacheService.invalidateCache("x")).resolves.toBeUndefined();
    await expect(cacheService.invalidatePattern("x")).resolves.toBeUndefined();
  });

  test("isEnabled() is false", () => {
    const { cacheService } = freshCacheService(undefined);
    expect(cacheService.isEnabled()).toBe(false);
  });
});
