// Shared login helper for the k6 scripts in this directory.
// Logs in once (per VU, in setup()) and returns the bearer token + user info
// the calling script needs for its authenticated requests.

import http from "k6/http";
import { check, fail } from "k6";

export function login(baseUrl, email, password, extra = {}) {
  const res = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password, ...extra }),
    { headers: { "Content-Type": "application/json" } }
  );

  const ok = check(res, {
    "login: status 200": (r) => r.status === 200,
    "login: has token": (r) => !!r.json("token"),
  });

  if (!ok) {
    fail(
      `login failed for ${email}: status=${res.status} body=${res.body?.slice(0, 300)}`
    );
  }

  return { token: res.json("token"), user: res.json("user") };
}

export function authHeaders(token) {
  return { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
}
