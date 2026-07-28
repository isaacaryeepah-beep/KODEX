# Frontend E2E tests (Playwright)

Closes the gap flagged in `CLAUDE.md`: the vanilla-JS SPA (`src/public/`) has
no test coverage from Jest, since Jest here is `testEnvironment: node` with
no DOM. Playwright drives a real browser against the real Express app
instead.

## Running locally

```bash
npm run test:e2e
```

This boots a real server (`tests/e2e/start-server.js`) against a real
MongoDB, same DB strategy as the Jest integration suites:

- **Default**: `mongodb-memory-server` downloads a `mongod` binary on first
  run (requires outbound internet — blocked in some sandboxed dev
  environments; see below).
- **Override**: set `TEST_MONGO_URI` to point at any reachable MongoDB
  (-compatible) server, e.g.:

  ```bash
  TEST_MONGO_URI="mongodb://127.0.0.1:27017/dikly_e2e" npm run test:e2e
  ```

Playwright's `webServer` config starts and stops this automatically; you
don't need to run it separately.

## Browsers

Uses `@playwright/test`'s own Chromium (`npx playwright install chromium`
if you don't already have it). CI installs it fresh on every run.

## What's covered so far

- `smoke.spec.js` — baseline sanity: server boots, the app shell loads
  with no console errors, `exam-preflight.html` renders on a desktop UA.
  If these fail, the problem is the harness itself (server boot, static
  serving, DB connection) — check here first before a more specific spec.
- `exam-preflight-person-detection.spec.js` — real verification that the
  in-browser Hugging Face person-detection model (`checkFace()` in
  `exam-preflight.html`) actually loads and runs, rather than silently
  falling back to the old brightness-only heuristic. This is network-
  dependent (fetches model weights from `huggingface.co` at runtime) and
  will fail in any environment that blocks that host — including some
  sandboxed dev environments, where it fails with a clear "Failed to
  fetch" rather than a false pass. A real CI environment (unrestricted
  outbound internet) is where this test's pass/fail is meaningful.

## Adding a new spec

Reuse `start-server.js` (via `playwright.config.js`'s `webServer`) rather
than writing another throwaway harness — that duplication cost real time
across this project's history before this file existed. Grant
`permissions`/`launchOptions` via `test.use({...})` at the top level of a
spec file (not inside a `describe` block — Playwright rejects that,
since some `use` options force a new worker).
