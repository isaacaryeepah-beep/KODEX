// Load test for POST /api/auth/login -- the single hottest unauthenticated
// endpoint in the app (every session starts here). Exercises the login
// company-scoping paths fixed in the security-hardening pass this session
// (institutionCode-scoped lookups) as well as the underlying User index
// coverage confirmed in the Phase 1 DB audit.
//
// Requires a real, already-seeded account on the target server -- this
// script does not create one. See README.md in this directory for the
// required env vars and how to seed a throwaway test account.
//
// Run:
//   k6 run -e BASE_URL=https://staging.dikly.sbs \
//           -e LOGIN_EMAIL=loadtest@yourinstitution.edu \
//           -e LOGIN_PASSWORD='...' \
//           k6/login-load.js

import { sleep } from "k6";
import { login } from "./lib/auth.js";

const BASE_URL       = __ENV.BASE_URL       || "http://localhost:5000";
const LOGIN_EMAIL    = __ENV.LOGIN_EMAIL    || "";
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || "";
const INSTITUTION_CODE = __ENV.INSTITUTION_CODE || "";

export const options = {
  scenarios: {
    steady_ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },   // warm up
        { duration: "2m",  target: 50 },   // sustained load
        { duration: "30s", target: 0 },    // cool down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<2000"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  login(BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD, INSTITUTION_CODE ? { institutionCode: INSTITUTION_CODE } : {});
  sleep(1); // roughly models a human hitting the login button, not a tight loop
}
