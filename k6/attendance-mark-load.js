// Load test for POST /api/attendance-sessions/mark -- the endpoint that
// runs on every single attendance mark, and the one with the most Phase 1
// index fixes riding on it (AttendanceRecord's per-mark device-lock check
// had zero index on `deviceId` before this session's work).
//
// This endpoint requires an ACTIVE attendance session to mark against.
// You must start a real session (as a lecturer, via the normal app flow
// or POST /api/attendance-sessions/start) on the target server before
// running this script, and pass its ID via SESSION_ID -- there is no way
// to safely fabricate one from a load-test script. method defaults to
// "manual" (no QR/BLE payload needed); adjust MARK_METHOD/MARK_CODE if
// your seeded session requires a different method.
//
// Run:
//   k6 run -e BASE_URL=https://staging.dikly.sbs \
//           -e LOGIN_EMAIL=student@yourinstitution.edu -e LOGIN_PASSWORD=... \
//           -e SESSION_ID=<active session _id> \
//           k6/attendance-mark-load.js
//
// NOTE: attendanceMarkLimiter caps this at 60 req/10min PER IP (see
// src/middleware/rateLimiter.js) -- from a single k6 load-generator IP
// you WILL hit 429s past that regardless of server capacity. That's
// expected and correct (it's the rate limiter working, not a real
// bottleneck) -- distribute across multiple source IPs if you actually
// need to load-test past that ceiling.

import http from "k6/http";
import { check, sleep } from "k6";
import { login, authHeaders } from "./lib/auth.js";

const BASE_URL         = __ENV.BASE_URL         || "http://localhost:5000";
const LOGIN_EMAIL      = __ENV.LOGIN_EMAIL      || "";
const LOGIN_PASSWORD   = __ENV.LOGIN_PASSWORD   || "";
const INSTITUTION_CODE = __ENV.INSTITUTION_CODE || "";
const SESSION_ID       = __ENV.SESSION_ID       || "";
const MARK_METHOD      = __ENV.MARK_METHOD      || "manual";
const MARK_CODE        = __ENV.MARK_CODE        || "";

if (!SESSION_ID) {
  throw new Error("SESSION_ID is required -- start a real attendance session on the target server first.");
}

export const options = {
  scenarios: {
    class_start_burst: {
      // Models the real traffic shape: a whole class marking attendance
      // in the first minute or two of a session, not a steady trickle.
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 40 },
        { duration: "45s", target: 40 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<600"],
  },
};

export function setup() {
  const { token } = login(
    BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD,
    INSTITUTION_CODE ? { institutionCode: INSTITUTION_CODE } : {}
  );
  return { token };
}

export default function (data) {
  const body = { sessionId: SESSION_ID, method: MARK_METHOD };
  if (MARK_CODE) body.code = MARK_CODE;

  const res = http.post(
    `${BASE_URL}/api/attendance-sessions/mark`,
    JSON.stringify(body),
    authHeaders(data.token)
  );

  check(res, {
    // 400 covers "already marked" on a repeat run of the same VU/session,
    // which is expected on anything but a fresh session -- only a 5xx or
    // an auth failure indicates a real problem.
    "mark: not a server error": (r) => r.status < 500,
    "mark: not an auth failure": (r) => r.status !== 401 && r.status !== 403,
  });

  sleep(2);
}
