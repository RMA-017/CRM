import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidPhoneInput,
  isValidNormalizedPhoneNumber,
  normalizePhoneDigits,
  normalizePhoneNumber
} from "../src/lib/phone-number.js";

test("phone helper normalizes Uzbek local numbers to Telegram contact format", () => {
  assert.equal(normalizePhoneNumber("90 123 45 67"), "+998901234567");
  assert.equal(normalizePhoneDigits("+998 (90) 123-45-67"), "998901234567");
});

test("phone helper normalizes Russian local numbers to Telegram contact format", () => {
  assert.equal(normalizePhoneNumber("8 (916) 123-45-67"), "+79161234567");
  assert.equal(normalizePhoneNumber("9161234567"), "+79161234567");
});

test("phone helper validates normalized E.164-style values", () => {
  assert.equal(isValidNormalizedPhoneNumber("+998901234567"), true);
  assert.equal(isValidNormalizedPhoneNumber("998901234567"), false);
  assert.equal(isValidNormalizedPhoneNumber("+123"), false);
  assert.equal(isValidPhoneInput("90 123 45 67"), true);
  assert.equal(isValidPhoneInput("abc1234567"), false);
});
