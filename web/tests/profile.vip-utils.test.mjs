import assert from "node:assert/strict";
import test from "node:test";
import {
  VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS,
  formatVipDailyRoutineActivityLabel,
  normalizeVipDailyRoutineActivityType
} from "../src/pages/profile/profile.vip-utils.js";

test("vip daily routine activity options match persisted activity types", () => {
  assert.deepEqual(
    VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS.map((item) => item.value),
    ["lesson", "breakfast", "lunch", "afternoon-snack", "sleep", "other", "meal"]
  );
});

test("vip daily routine activity normalizer accepts legacy aliases", () => {
  assert.equal(normalizeVipDailyRoutineActivityType("lesson"), "lesson");
  assert.equal(normalizeVipDailyRoutineActivityType("group-lesson"), "lesson");
  assert.equal(normalizeVipDailyRoutineActivityType("breakfast"), "breakfast");
  assert.equal(normalizeVipDailyRoutineActivityType("lunch"), "lunch");
  assert.equal(normalizeVipDailyRoutineActivityType("afternoon-snack"), "afternoon-snack");
  assert.equal(normalizeVipDailyRoutineActivityType("meal"), "meal");
  assert.equal(normalizeVipDailyRoutineActivityType("sleep"), "sleep");
  assert.equal(normalizeVipDailyRoutineActivityType("sleep-time"), "sleep");
  assert.equal(normalizeVipDailyRoutineActivityType("other"), "other");
  assert.equal(normalizeVipDailyRoutineActivityType("bad-value"), "");
});

test("vip daily routine formatter keeps labels stable for strict and legacy values", () => {
  assert.equal(formatVipDailyRoutineActivityLabel("lesson"), "Group lesson");
  assert.equal(formatVipDailyRoutineActivityLabel("group-lesson"), "Group lesson");
  assert.equal(formatVipDailyRoutineActivityLabel("breakfast"), "Breakfast");
  assert.equal(formatVipDailyRoutineActivityLabel("lunch"), "Lunch");
  assert.equal(formatVipDailyRoutineActivityLabel("afternoon-snack"), "Afternoon snack");
  assert.equal(formatVipDailyRoutineActivityLabel("meal"), "Meal");
  assert.equal(formatVipDailyRoutineActivityLabel("sleep"), "Sleep time");
  assert.equal(formatVipDailyRoutineActivityLabel("sleep-time"), "Sleep time");
  assert.equal(formatVipDailyRoutineActivityLabel("other"), "Other");
  assert.equal(formatVipDailyRoutineActivityLabel("unknown"), "-");
});
