# Load testing (k6)

Scripts here target the three hottest paths identified in the Phase 1 DB
audit: login, attendance marking, and the (now Redis-cached) dashboards.

## Honest status

These scripts were written but **not executed** — there is no k6 binary and
no live, seeded Dikly server in the sandbox this was authored in (no
network access to a real MongoDB either — see the test suite comments for
the same constraint). They're built directly against the real request/
response contracts in `src/routes/` and `src/controllers/` (not guessed),
but like any load-test script, they need one real dry run against a live
environment to shake out fixture/payload issues before the numbers they
produce can be trusted.

## Setup

1. Install k6: https://k6.io/docs/get-started/installation/
2. Seed a throwaway test account on whatever server you're pointing at
   (staging strongly preferred over production — this generates real
   traffic and, for `attendance-mark-load.js`, real attendance records).
   You need, at minimum:
   - One institution (`institutionCode`)
   - One user per dashboard role you want to test (student/lecturer/
     employee/admin/manager), with a known password
   - For `attendance-mark-load.js`: an **active** attendance session
     started through the normal app flow — its `_id` goes in `SESSION_ID`

## Scripts

| Script | Targets | Requires |
|---|---|---|
| `login-load.js` | `POST /api/auth/login` | `LOGIN_EMAIL`, `LOGIN_PASSWORD` |
| `dashboard-load.js` | `GET /api/dashboard/:role` (Phase 2 cached endpoints) | same, + `DASHBOARD_ROLE` |
| `attendance-mark-load.js` | `POST /api/attendance-sessions/mark` | same, + `SESSION_ID` |

All accept `BASE_URL` (default `http://localhost:5000`) and optional
`INSTITUTION_CODE`.

## Running

```bash
k6 run -e BASE_URL=https://staging.dikly.sbs \
       -e LOGIN_EMAIL=loadtest@yourinstitution.edu \
       -e LOGIN_PASSWORD='...' \
       k6/login-load.js
```

`dashboard-load.js` and `attendance-mark-load.js` follow the same pattern
— see the comment block at the top of each file for its specific env vars
and what it's actually trying to measure.

## Reading the results — what to actually check

- **`dashboard-load.js` is the one that validates Phase 2's caching work
  directly.** Its whole design is many concurrent VUs hitting the *same*
  account, so they share one Redis cache key. p95 latency should visibly
  drop after the first request in each ~30s (10s for `/employee`) window.
  If it doesn't, that's a real signal — check that `REDIS_URL` is actually
  set on the target server (caching fails open and silently does nothing
  without it, by design — see `src/services/cacheService.js`).
- **`attendance-mark-load.js` will hit 429s past 60 requests/10min from a
  single load-generator IP** — that's `attendanceMarkLimiter`
  (`src/middleware/rateLimiter.js`) working as intended, not a capacity
  problem. Don't read 429s here as a scalability finding.
- None of these scripts prove anything about **horizontal scaling**
  specifically (Phase 5) — they exercise a single instance. Re-run against
  a multi-instance deployment once that's live to see whether the
  Redis-backed rate limiter (Phase 5) holds up the same way the in-memory
  one would not have.
