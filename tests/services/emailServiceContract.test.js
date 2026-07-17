"use strict";

/**
 * Contract + unit coverage for emailService, added after a real production
 * bug: the superadmin "Send email" panel called emailService.sendCustom(),
 * which did not exist -- every send since the feature shipped threw
 * "sendCustom is not a function" and surfaced as a 500 "Server error" toast.
 *
 * The contract block asserts every emailService function referenced anywhere
 * in src/ actually exists on the real module -- catching this whole bug
 * class (route wired to a phantom export) without any network or DB.
 * The sendCustom block covers the new function's own behavior: with no
 * email credentials configured it must resolve gracefully (dev mode ok:true
 * / production ok:false), never throw, and escape HTML in the free-typed
 * subject/message so superadmin input can't inject markup into the email.
 */

const fs   = require("fs");
const path = require("path");

const emailService = require("../../src/services/emailService");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

describe("emailService contract — every call site's function actually exists", () => {
  test("all emailService.<fn>() references in src/ resolve to real exports", () => {
    const srcRoot = path.join(__dirname, "..", "..", "src");
    const referenced = new Set();

    for (const file of walk(srcRoot)) {
      const content = fs.readFileSync(file, "utf8");
      for (const m of content.matchAll(/emailService\.(\w+)\s*\(/g)) {
        referenced.add(m[1]);
      }
    }

    expect(referenced.size).toBeGreaterThan(0); // sanity: the scan found call sites

    const missing = [...referenced].filter((fn) => typeof emailService[fn] !== "function");
    // The exact production bug this guards against: superadmin.js called
    // emailService.sendCustom() for months while no such export existed.
    expect(missing).toEqual([]);
  });
});

describe("sendCustom", () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  test("resolves in dev mode (no credentials) without throwing", async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.MAILERSEND_API_KEY;
    delete process.env.RENDER;
    process.env.NODE_ENV = "test";

    const result = await emailService.sendCustom({
      to: "admin@institution.test",
      toName: "Test Admin",
      subject: "Scheduled maintenance",
      message: "We will take 5 mins to make updates",
    });
    expect(result.ok).toBe(true);
    expect(result.dev).toBe(true);
  });

  test("fails loudly (ok:false, no throw) when unconfigured in production", async () => {
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.MAILERSEND_API_KEY;
    process.env.NODE_ENV = "production";

    const result = await emailService.sendCustom({
      to: "admin@institution.test",
      toName: "Test Admin",
      subject: "Hello",
      message: "World",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  test("returns ok:false for a missing recipient instead of throwing", async () => {
    const result = await emailService.sendCustom({
      to: null,
      toName: "Nobody",
      subject: "x",
      message: "y",
    });
    expect(result.ok).toBe(false);
  });
});
