import assert from "node:assert/strict";
import test from "node:test";
import { MIN_BIRTHDAY_YMD, isValidDateYmd, validateBirthdayYmd } from "../src/lib/date.js";
import { parsePositiveInteger } from "../src/lib/number.js";

function toYmd(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("parsePositiveInteger parses valid positive integers", () => {
  assert.equal(parsePositiveInteger(7), 7);
  assert.equal(parsePositiveInteger("42"), 42);
});

test("parsePositiveInteger rejects non-positive values", () => {
  assert.equal(parsePositiveInteger(0), null);
  assert.equal(parsePositiveInteger(-1), null);
  assert.equal(parsePositiveInteger("abc"), null);
});

test("isValidDateYmd validates strict YYYY-MM-DD dates", () => {
  assert.equal(isValidDateYmd("2024-02-29"), true);
  assert.equal(isValidDateYmd("2025-02-29"), false);
  assert.equal(isValidDateYmd("2025-13-01"), false);
  assert.equal(isValidDateYmd("not-a-date"), false);
});

test("validateBirthdayYmd enforces required and range rules", () => {
  assert.equal(validateBirthdayYmd("", { required: true }), "Birthday is required.");
  assert.equal(validateBirthdayYmd("invalid"), "Invalid birthday format.");

  const tooOld = new Date(MIN_BIRTHDAY_YMD);
  tooOld.setDate(tooOld.getDate() - 1);
  assert.equal(validateBirthdayYmd(toYmd(tooOld)), "Birthday is out of allowed range.");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(validateBirthdayYmd(toYmd(tomorrow)), "Birthday is out of allowed range.");
});
