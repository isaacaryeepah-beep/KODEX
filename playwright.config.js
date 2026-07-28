// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// Frontend E2E tests for the vanilla-JS SPA (src/public/), which has no
// other test coverage -- Jest here is testEnvironment: node with no DOM,
// so it can't touch this code at all. Runs against the real Express app
// (tests/e2e/start-server.js) and a real MongoDB, same DB strategy as the
// Jest integration suites. See tests/e2e/README.md for local usage.
const PORT = process.env.PORT || 5099;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "node tests/e2e/start-server.js",
    url: `http://127.0.0.1:${PORT}/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
