import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

const { isAllowedCorsOrigin, shouldRejectBrowserOrigin } = await import("../src/plugins/security.js");

test("isAllowedCorsOrigin allows configured localhost default", () => {
  assert.equal(isAllowedCorsOrigin("http://localhost:5173"), true);
});

test("shouldRejectBrowserOrigin allows safe methods", () => {
  assert.equal(
    shouldRejectBrowserOrigin({
      method: "GET",
      origin: "https://evil.example",
      secFetchSite: "cross-site",
      hasAuthCookie: true
    }),
    false
  );
});

test("shouldRejectBrowserOrigin rejects cross-site unsafe browser requests", () => {
  assert.equal(
    shouldRejectBrowserOrigin({
      method: "POST",
      origin: "https://evil.example",
      secFetchSite: "cross-site",
      hasAuthCookie: true
    }),
    true
  );
});

test("shouldRejectBrowserOrigin allows same-origin unsafe browser requests", () => {
  assert.equal(
    shouldRejectBrowserOrigin({
      method: "PATCH",
      origin: "http://localhost:5173",
      secFetchSite: "same-origin",
      hasAuthCookie: true
    }),
    false
  );
});

test("shouldRejectBrowserOrigin falls back to referer origin", () => {
  assert.equal(
    shouldRejectBrowserOrigin({
      method: "DELETE",
      referer: "https://evil.example/path",
      hasAuthCookie: true
    }),
    true
  );

  assert.equal(
    shouldRejectBrowserOrigin({
      method: "DELETE",
      referer: "http://localhost:5173/profile",
      hasAuthCookie: true
    }),
    false
  );
});

test("shouldRejectBrowserOrigin allows non-browser programmatic requests without browser signals", () => {
  assert.equal(
    shouldRejectBrowserOrigin({
      method: "POST",
      hasAuthCookie: false
    }),
    false
  );
});
