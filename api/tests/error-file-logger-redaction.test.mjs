import assert from "node:assert/strict";
import test from "node:test";
import { __errorFileLoggerContracts } from "../src/lib/error-file-logger.js";

test("error file logger redacts authentication secrets", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.signature_value";
  const output = __errorFileLoggerContracts.safeStringify({
    request: {
      headers: {
        authorization: `Bearer ${jwt}`,
        cookie: `crm_access_token=${jwt}`
      },
      rawHeaders: ["Cookie", `crm_access_token=${jwt}`],
      cookies: { crm_access_token: jwt },
      body: {
        password: "plain-password",
        nestedToken: jwt,
        note: `Unexpected bearer Bearer ${jwt}`
      }
    }
  });

  assert.doesNotMatch(output, /plain-password|signature_value|crm_access_token=/);
  assert.match(output, /\[REDACTED\]/);
});
