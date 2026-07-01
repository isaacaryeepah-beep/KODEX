"use strict";
const { sanitizeInputs } = require("../../src/middleware/sanitize");

function runMiddleware(req) {
  return new Promise((resolve, reject) => {
    sanitizeInputs(req, {}, (err) => (err ? reject(err) : resolve(req)));
  });
}

describe("sanitizeInputs middleware", () => {
  describe("NoSQL injection prevention", () => {
    test("strips $ operator keys from body", async () => {
      const req = { body: { $where: "1==1", name: "Alice" }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body).not.toHaveProperty("$where");
      expect(req.body.name).toBe("Alice");
    });

    test("strips nested $ keys", async () => {
      const req = { body: { filter: { $gt: 0, age: 20 } }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.filter).not.toHaveProperty("$gt");
      expect(req.body.filter.age).toBe(20);
    });

    test("strips $ keys from query", async () => {
      const req = { body: {}, query: { $where: "1==1", q: "john" }, params: {} };
      await runMiddleware(req);
      expect(req.query).not.toHaveProperty("$where");
      expect(req.query.q).toBe("john");
    });
  });

  describe("XSS prevention", () => {
    test("removes script tags", async () => {
      const req = { body: { name: '<script>alert("xss")</script>Hello' }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.name).not.toContain("<script>");
      expect(req.body.name).toContain("Hello");
    });

    test("removes HTML tags", async () => {
      const req = { body: { bio: "<b>bold</b> text" }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.bio).toBe("bold text");
    });

    test("removes javascript: protocol", async () => {
      const req = { body: { url: "javascript:alert(1)" }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.url).not.toContain("javascript:");
    });

    test("removes inline event handlers", async () => {
      const req = { body: { label: 'Click <a onclick=alert(1)>here</a>' }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.label).not.toContain("onclick");
    });
  });

  describe("password field passthrough", () => {
    test("never sanitizes password fields", async () => {
      const pw = 'P@$$w0rd<script>"test"';
      const req = { body: { password: pw, newPassword: pw, confirmPassword: pw }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.password).toBe(pw);
      expect(req.body.newPassword).toBe(pw);
      expect(req.body.confirmPassword).toBe(pw);
    });

    test("never sanitizes token fields", async () => {
      const token = "eyJhbGciOiJIUzI1NiJ9.payload.<script>";
      const req = { body: { token }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.token).toBe(token);
    });
  });

  describe("arrays and nested objects", () => {
    test("sanitizes all items in arrays", async () => {
      const req = { body: { tags: ["<b>one</b>", "two", "<script>bad</script>three"] }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.tags[0]).toBe("one");
      expect(req.body.tags[1]).toBe("two");
      expect(req.body.tags[2]).toBe("three");
    });

    test("passes through non-string, non-object values untouched", async () => {
      const req = { body: { count: 42, active: true, data: null }, query: {}, params: {} };
      await runMiddleware(req);
      expect(req.body.count).toBe(42);
      expect(req.body.active).toBe(true);
      expect(req.body.data).toBeNull();
    });
  });
});
