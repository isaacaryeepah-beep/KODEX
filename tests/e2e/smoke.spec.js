"use strict";

/**
 * Baseline sanity checks for the E2E harness itself. If these fail, the
 * problem is the test infra (server boot, static file serving, DB
 * connection), not whatever a more specific spec is trying to verify --
 * check this file first.
 */

const { test, expect } = require("@playwright/test");

test("server boots and serves the app shell", async ({ page }) => {
  const res = await page.request.get("/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("login page loads with no console errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  expect(errors).toEqual([]);
});

test("exam-preflight page loads and the mobile-block script does not fire on desktop", async ({ page }) => {
  await page.goto("/exam-preflight.html");
  // The page nukes its own body for phone/tablet user agents (see the
  // inline script at the top of exam-preflight.html) -- on a desktop
  // Chromium UA, the real preflight card should still be present.
  await expect(page.locator(".card").first()).toBeVisible();
});
