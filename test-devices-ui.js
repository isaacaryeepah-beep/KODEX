"use strict";
const { chromium } = require("playwright");

(async () => {
  const SITE = "https://dikly.sbs";
  // Use the demo/reviewer credentials created earlier in the project
  const EMAIL    = "reviewer@dikly.sbs";
  const PASSWORD = "DiklyReview2024!";

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH + "/chromium-1194/chrome-linux/chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
  });

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let passed = 0, failed = 0;

  function assert(label, condition) {
    if (condition) { console.log(`  ✓ ${label}`); passed++; }
    else           { console.error(`  ✗ FAIL: ${label}`); failed++; }
  }

  try {
    console.log("\n── Navigating to login page ──");
    await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log(`  Page title: ${await page.title()}`);
    console.log(`  Page URL: ${page.url()}`);
    const bodyText = await page.evaluate(() => document.body ? document.body.innerHTML.substring(0, 500) : 'NO BODY');
    console.log(`  Body preview: ${bodyText.replace(/\n/g,' ').substring(0,400)}`);

    // Check login form is present
    const emailInput = await page.$('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]');
    assert("Login page has email input", !!emailInput);

    // Fill login form
    if (emailInput) {
      await emailInput.fill(EMAIL);
      const pwInput = await page.$('input[type="password"]');
      assert("Login page has password input", !!pwInput);
      if (pwInput) {
        await pwInput.fill(PASSWORD);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(4000);
      }
    }

    const url = page.url();
    console.log(`\n── After login: ${url}`);
    const loggedIn = !url.includes("login") && !url.includes("signin");
    assert("Successfully logged in (redirected away from login)", loggedIn);

    if (!loggedIn) {
      // Try clicking sign in button
      const btn = await page.$('button:has-text("Sign In"), button:has-text("Login"), .btn-primary');
      if (btn) {
        await btn.click();
        await page.waitForTimeout(4000);
      }
    }

    // Navigate to profile
    console.log("\n── Navigating to Profile page ──");
    await page.evaluate(() => {
      if (typeof showSection === 'function') showSection('profile');
      else if (typeof renderProfile === 'function') renderProfile();
    });
    await page.waitForTimeout(3000);

    // Check for profile page elements
    const profileHeader = await page.$('text=My Profile');
    assert("Profile page header visible", !!profileHeader);

    // Check for devices section
    const devicesHeading = await page.$('text=Signed-in Devices');
    assert("'Signed-in Devices' section is present on profile page", !!devicesHeading);

    // Check devices list loaded (not still showing "Loading...")
    await page.waitForTimeout(2000);
    const loadingText = await page.$('text=Loading devices…');
    assert("Device list finished loading (no spinner)", !loadingText);

    // Check that devices-list div has content
    const devicesList = await page.$('#devices-list');
    if (devicesList) {
      const html = await devicesList.innerHTML();
      assert("Devices list has content", html.trim().length > 0);
      const hasDevice = html.includes('platform') || html.includes('Current') || html.includes('ago') || html.includes('device');
      assert("Devices list shows at least one device or a meaningful message", hasDevice || html.includes('No devices'));
      console.log(`  Devices section HTML preview: ${html.substring(0, 200).replace(/\n/g,' ')}`);
    } else {
      assert("Devices list container (#devices-list) exists", false);
    }

    // Take a screenshot
    await page.screenshot({ path: "/tmp/test-devices-ui.png", fullPage: false });
    console.log("\n  Screenshot saved to /tmp/test-devices-ui.png");

  } catch (e) {
    console.error("Test error:", e.message);
    failed++;
  } finally {
    await browser.close();
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
