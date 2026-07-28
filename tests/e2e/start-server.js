"use strict";

/**
 * Boots the real Express app (src/server.js exports `start` without
 * auto-booting -- see its require.main guard) against a real MongoDB, for
 * Playwright's webServer to point a real browser at. Same DB strategy as
 * the Jest integration suites (tests/routes/auth.test.js etc.):
 *
 *   - CI / default:   mongodb-memory-server (downloads mongod on first run)
 *   - local override: TEST_MONGO_URI=mongodb://127.0.0.1:27017/dikly_e2e
 */

process.env.NODE_ENV           = "test";
process.env.JWT_SECRET         = process.env.JWT_SECRET         || "test-jwt-secret-e2e-suite-0000000001";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-e2e-suite-001";
process.env.PORT               = process.env.PORT               || "5099";

(async () => {
  if (process.env.TEST_MONGO_URI) {
    process.env.MONGODB_URI = process.env.TEST_MONGO_URI;
  } else {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    const memoryServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = memoryServer.getUri("dikly_e2e");
  }

  const { start } = require("../../src/server.js");
  await start();
})().catch((err) => {
  console.error("[e2e] server failed to start:", err);
  process.exit(1);
});
