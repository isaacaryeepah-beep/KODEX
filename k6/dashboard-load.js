// Load test for the dashboard endpoints Redis-cached in Phase 2
// (src/controllers/dashboardController.js). Deliberately drives MANY
// virtual users at the SAME account so they share one cache key
// (dash:<role>:<company>[:<userId>]) -- this is the realistic case the
// caching work targets: many students/employees loading their dashboard
// around the same moment (start of class, start of shift), not one user
// hammering their own dashboard.
//
// A useful signal to watch in the k6 summary: p95 latency should be
// noticeably lower here than on a cache-cold single-hit baseline, since
// only the first request per TTL window (30s, or 10s for /employee) pays
// the real DB cost -- everything else within that window should be a
// fast Redis read. If p95 looks the same as a guaranteed-cache-miss run,
// that's a sign the cache isn't actually being hit (wrong REDIS_URL on
// the target server, TTL shorter than expected, etc.) -- worth checking
// before trusting any conclusion drawn from this script.
//
// Requires a real, already-seeded account on the target server. See
// README.md for required env vars.
//
// Run (student dashboard, default):
//   k6 run -e BASE_URL=https://staging.dikly.sbs \
//           -e LOGIN_EMAIL=... -e LOGIN_PASSWORD=... \
//           k6/dashboard-load.js
//
// Run against a different dashboard:
//   k6 run -e DASHBOARD_ROLE=lecturer ... k6/dashboard-load.js
//   (DASHBOARD_ROLE one of: academic | corporate | lecturer | student | employee)

import http from "k6/http";
import { check, sleep } from "k6";
import { login, authHeaders } from "./lib/auth.js";

const BASE_URL         = __ENV.BASE_URL         || "http://localhost:5000";
const LOGIN_EMAIL      = __ENV.LOGIN_EMAIL      || "";
const LOGIN_PASSWORD   = __ENV.LOGIN_PASSWORD   || "";
const INSTITUTION_CODE = __ENV.INSTITUTION_CODE || "";
const DASHBOARD_ROLE   = __ENV.DASHBOARD_ROLE   || "student";

const VALID_ROLES = ["academic", "corporate", "lecturer", "student", "employee"];
if (!VALID_ROLES.includes(DASHBOARD_ROLE)) {
  throw new Error(`DASHBOARD_ROLE must be one of ${VALID_ROLES.join(", ")}, got "${DASHBOARD_ROLE}"`);
}

export const options = {
  scenarios: {
    concurrent_same_account: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 100 },  // burst: everyone opens the dashboard at once
        { duration: "1m",  target: 100 },  // hold
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    checks: ["rate>0.99"],
  },
};

// setup() runs once, not per-VU -- every VU below shares this one token,
// which is the point: they're all the same account, hitting the same
// cache key concurrently.
export function setup() {
  const { token } = login(
    BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD,
    INSTITUTION_CODE ? { institutionCode: INSTITUTION_CODE } : {}
  );
  return { token };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/dashboard/${DASHBOARD_ROLE}`, authHeaders(data.token));
  check(res, {
    "dashboard: status 200": (r) => r.status === 200,
    "dashboard: has body": (r) => !!r.body && r.body.length > 2,
  });
  sleep(0.5);
}
