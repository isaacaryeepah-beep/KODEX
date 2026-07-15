"use strict";

/**
 * Unit test for src/services/emailService.js's send() dev-mode fallback.
 *
 * Regression test for a real bug: when neither GMAIL_APP_PASSWORD nor
 * MAILERSEND_API_KEY is configured, send() used to unconditionally return
 * { ok: true, dev: true } so local dev never errors out. If those env vars
 * are ever missing in production too, callers like send2FACode() would
 * believe the email went out and show "A 6-digit code was sent to..." while
 * nothing was actually sent. send() must fail loudly in production instead.
 */

describe("emailService.send() — missing-credentials fallback", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function loadWithEnv(env) {
    process.env = { ...ORIGINAL_ENV, ...env };
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.MAILERSEND_API_KEY;
    jest.resetModules();
    return require("../../src/services/emailService");
  }

  test("production with no email credentials: send() fails instead of faking success", async () => {
    const emailService = loadWithEnv({ NODE_ENV: "production" });
    const result = await emailService.send({ to: "user@example.com", subject: "Test" });
    expect(result.ok).toBe(false);
    expect(result.dev).toBeUndefined();
  });

  test("Render production flag with no email credentials: send() fails instead of faking success", async () => {
    const emailService = loadWithEnv({ NODE_ENV: "", RENDER: "true" });
    const result = await emailService.send({ to: "user@example.com", subject: "Test" });
    expect(result.ok).toBe(false);
  });

  test("non-production with no email credentials: send() still no-ops as a dev convenience", async () => {
    const emailService = loadWithEnv({ NODE_ENV: "development", RENDER: "" });
    const result = await emailService.send({ to: "user@example.com", subject: "Test" });
    expect(result.ok).toBe(true);
    expect(result.dev).toBe(true);
  });
});
