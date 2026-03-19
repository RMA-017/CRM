import assert from "node:assert/strict";
import test from "node:test";
import {
  VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS,
  formatVipDailyRoutineActivityLabel,
  mapVipClassDailyRoutineItem,
  normalizeVipDailyRoutineActivityType
} from "../src/pages/profile/profile.vip-utils.js";

test("vip daily routine activity options match persisted activity types", () => {
  assert.deepEqual(
    VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS.map((item) => item.value),
    ["lesson", "breakfast", "lunch", "afternoon-snack", "sleep", "other"]
  );
});

test("vip daily routine activity normalizer accepts legacy aliases", () => {
  assert.equal(normalizeVipDailyRoutineActivityType("lesson"), "lesson");
  assert.equal(normalizeVipDailyRoutineActivityType("group-lesson"), "lesson");
  assert.equal(normalizeVipDailyRoutineActivityType("breakfast"), "breakfast");
  assert.equal(normalizeVipDailyRoutineActivityType("lunch"), "lunch");
  assert.equal(normalizeVipDailyRoutineActivityType("afternoon-snack"), "afternoon-snack");
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
  assert.equal(formatVipDailyRoutineActivityLabel("sleep"), "Sleep time");
  assert.equal(formatVipDailyRoutineActivityLabel("sleep-time"), "Sleep time");
  assert.equal(formatVipDailyRoutineActivityLabel("other"), "Other");
  assert.equal(formatVipDailyRoutineActivityLabel("unknown"), "-");
});

test("vip daily routine item mapping keeps specialist and note fields stable", () => {
  assert.deepEqual(
    mapVipClassDailyRoutineItem({
      id: "7",
      class_id: "11",
      class_name: "Morning Group",
      teacher_id: "4",
      teacher_name: "Teacher",
      specialist_user_id: "9",
      specialist_name: "Tutor One",
      specialist_role: "Speech therapist",
      day_of_week: 2,
      activity_type: "lesson",
      start_time: "09:00",
      end_time: "10:00",
      note: "Bring pencils"
    }),
    {
      id: "7",
      classId: "11",
      className: "Morning Group",
      teacherId: "4",
      teacherName: "Teacher",
      specialistId: "9",
      specialistName: "Tutor One",
      specialistRole: "Speech therapist",
      childrenCount: 0,
      dayOfWeek: 2,
      activityType: "lesson",
      startTime: "09:00",
      endTime: "10:00",
      note: "Bring pencils"
    }
  );
});
