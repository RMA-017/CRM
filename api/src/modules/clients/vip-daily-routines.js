const VIP_DAILY_ROUTINE_DAY_KEY_TO_NUM = Object.freeze({
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
  dushanba: 1,
  seshanba: 2,
  chorshanba: 3,
  payshanba: 4,
  juma: 5,
  shanba: 6,
  yakshanba: 7
});

const VIP_DAILY_ROUTINE_DAY_NUM_TO_KEY = Object.freeze({
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  7: "sun"
});

const VIP_CLASS_DAILY_ROUTINE_ACTIVITY_ALIASES = Object.freeze({
  lesson: "lesson",
  "group-lesson": "lesson",
  dars: "lesson",
  class: "lesson",
  study: "lesson",
  breakfast: "breakfast",
  nonushta: "breakfast",
  lunch: "lunch",
  tushlik: "lunch",
  "afternoon-snack": "afternoon-snack",
  snack: "afternoon-snack",
  poldnik: "afternoon-snack",
  sleep: "sleep",
  "sleep-time": "sleep",
  nap: "sleep",
  uxlash: "sleep",
  uyqu: "sleep",
  other: "other",
  boshqa: "other"
});

const VIP_CLASS_DAILY_ROUTINE_ACTIVITY_SET = new Set([
  "lesson",
  "breakfast",
  "lunch",
  "afternoon-snack",
  "sleep",
  "other"
]);

export function normalizeVipDailyRoutineDayOfWeek(value, { allowAliases = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }

  if (!allowAliases) {
    return 0;
  }

  return VIP_DAILY_ROUTINE_DAY_KEY_TO_NUM[normalized] || 0;
}

export function getVipDailyRoutineDayKey(value) {
  return VIP_DAILY_ROUTINE_DAY_NUM_TO_KEY[Number(value)] || "";
}

export function normalizeVipClassDailyRoutineActivityType(value, { allowAliases = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (allowAliases) {
    return VIP_CLASS_DAILY_ROUTINE_ACTIVITY_ALIASES[normalized] || "";
  }
  return VIP_CLASS_DAILY_ROUTINE_ACTIVITY_SET.has(normalized) ? normalized : "";
}
