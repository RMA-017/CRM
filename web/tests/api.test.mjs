import assert from "node:assert/strict";
import test from "node:test";
import {
  getApiErrorMessage,
  normalizeApiError,
  readApiResponseData
} from "../src/lib/api.js";

test("readApiResponseData parses JSON payloads", async () => {
  const response = new Response(JSON.stringify({ message: "ok", value: 1 }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

  const data = await readApiResponseData(response);
  assert.deepEqual(data, { message: "ok", value: 1 });
});

test("readApiResponseData normalizes text payloads", async () => {
  const response = new Response("Plain error text", {
    status: 500,
    headers: { "content-type": "text/plain" }
  });

  const data = await readApiResponseData(response);
  assert.deepEqual(data, { message: "Plain error text" });
});

test("readApiResponseData returns empty object for no-content responses", async () => {
  const response = new Response(null, { status: 204 });
  const data = await readApiResponseData(response);
  assert.deepEqual(data, {});
});

test("normalizeApiError keeps API message when provided", () => {
  const error = normalizeApiError({ status: 400 }, { message: "Validation failed.", field: "email" });
  assert.equal(error.status, 400);
  assert.equal(error.message, "Validation failed.");
  assert.equal(error.field, "email");
});

test("getApiErrorMessage falls back by status code", () => {
  const message = getApiErrorMessage({ status: 403 }, {}, "Custom fallback.");
  assert.equal(message, "Forbidden.");
});

test("readApiResponseData maps validation error arrays into field errors", async () => {
  const response = new Response(JSON.stringify({
    code: "VALIDATION_ERROR",
    message: "Invalid field.",
    field: "username",
    errors: [
      { field: "username", message: "Username is required." },
      { field: "password", message: "Password is required." }
    ]
  }), {
    status: 400,
    headers: { "content-type": "application/json" }
  });

  const data = await readApiResponseData(response);
  assert.deepEqual(data.errors, {
    username: "Username is required.",
    password: "Password is required."
  });
  assert.equal(Array.isArray(data.validationErrors), true);
  assert.equal(data.validationErrors.length, 2);
});

test("normalizeApiError preserves mapped field errors from validation arrays", () => {
  const error = normalizeApiError(
    { status: 400 },
    {
      code: "VALIDATION_ERROR",
      message: "Invalid value.",
      errors: [
        { field: "email", message: "Invalid email format." }
      ]
    }
  );

  assert.deepEqual(error.errors, {
    email: "Invalid email format."
  });
  assert.equal(error.validationErrors.length, 1);
});
