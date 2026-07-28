"use strict";

/**
 * Real verification for the in-browser person-detection feature
 * (src/public/exam-preflight.html's checkFace(), see PR #780) -- the piece
 * that could not be verified end-to-end during development because the
 * sandbox that shipped it blocks outbound access to huggingface.co, where
 * the detection model's weights are fetched from at runtime. GitHub
 * Actions runners have normal internet access, so this is the first place
 * that class of failure would actually be observable.
 *
 * This does NOT assert on detection *accuracy* -- Chromium's fake camera
 * device produces a synthetic test pattern, not footage of a real person,
 * so "0 people detected" is the expected and correct result against it.
 * What this asserts is that the model genuinely loaded and ran: if the
 * network fetch to Hugging Face is blocked or fails, checkFace() silently
 * swallows the error and permanently falls back to the old brightness
 * heuristic (window._personDetectorFailed becomes true) -- exactly the
 * failure mode this test exists to catch, since that fallback means the
 * "multiple people" enforcement PR #780 shipped to fix is silently not
 * happening in production.
 */

const { test, expect } = require("@playwright/test");

test.use({
  permissions: ["camera", "microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test.describe("exam-preflight person detection", () => {
  test("the Hugging Face model loads and runs (does not fall back to the brightness heuristic)", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/exam-preflight.html?quizId=e2e-test&userId=e2e&userName=E2E");

    // window._getPersonDetector is defined by the module script in
    // exam-preflight.html regardless of network state -- wait for it to
    // exist, then wait for the promise it returns to settle either way.
    await page.waitForFunction(() => typeof window._getPersonDetector === "function", null, { timeout: 15_000 });

    const outcome = await page.evaluate(async () => {
      try {
        await window._getPersonDetector();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    });

    if (!outcome.ok) {
      throw new Error(
        `Person-detection model failed to load: ${outcome.message}\n` +
        `This means exam-preflight.html's face check is silently running on the old ` +
        `brightness-only heuristic in this environment -- it can no longer detect ` +
        `multiple people in frame. If this environment has real internet access, ` +
        `this is a real regression, not a network fluke.`
      );
    }
    expect(outcome.ok).toBe(true);

    // Drive an actual checkFace() cycle against the fake camera feed and
    // confirm it went through the real-detection branch, not the fallback.
    const video = page.locator("#camPreview");
    await expect(video).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      () => {
        const v = document.getElementById("camPreview");
        return v && v.readyState >= 2 && v.videoWidth > 0;
      },
      null,
      { timeout: 15_000 }
    );

    // checkFace() runs on its own setTimeout schedule (see exam-preflight.html);
    // give it a full cycle to complete a real-detection attempt.
    await page.waitForTimeout(5_000);

    const detectorFailed = await page.evaluate(() => window._personDetectorFailed === true);
    expect(detectorFailed, "checkFace() fell back to the brightness heuristic -- the real model never ran").toBe(false);

    expect(pageErrors, "unexpected page errors while loading the detection model").toEqual([]);
  });
});
