import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { toBooleanFlag } from "../src/lib/boolean.js";
import { toBoundedInteger } from "../src/lib/bounded-integer.js";
import {
  MIN_BIRTHDAY_YMD,
  formatDateYmd,
  isValidDateYmd,
  normalizeDateYmd,
  validateBirthdayYmd
} from "../src/lib/date.js";
import { sendMigrationRequired } from "../src/lib/http.js";
import {
  getNotificationRetentionDaysMessage,
  parseNotificationRetentionDays
} from "../src/lib/notification-retention.js";
import { normalizeNotificationListLimit } from "../src/lib/notification-limits.js";
import { normalizeInteger, normalizePositiveInteger, parsePositiveInteger } from "../src/lib/number.js";
import { parseBooleanOr, parseNullableBoolean, parseOptionalOrganizationId } from "../src/lib/request-parsers.js";
import {
  normalizeWorkScheduleDayOfWeek,
  normalizeWorkScheduleReason,
  normalizeWorkScheduleScope,
  normalizeWorkScheduleTime
} from "../src/modules/appointments/work-schedule.js";
import {
  normalizeDurationOptions,
  normalizeReminderChannels,
  normalizeScheduleScope
} from "../src/modules/appointments/schedule-normalizers.js";
import {
  getDurationMinutesFromTimes,
  normalizeTimeHm,
  toTimeMinutes
} from "../src/modules/appointments/time.js";
import {
  getVipDailyRoutineDayKey,
  normalizeVipClassDailyRoutineActivityType,
  normalizeVipDailyRoutineDayOfWeek
} from "../src/modules/clients/vip-daily-routines.js";
import {
  normalizeManagerNotificationTargetRoles,
  normalizeNotificationRouteTargetRoles,
  normalizeNotificationRouteTargetUserIds
} from "../src/lib/notification-targets.js";
import {
  isDirectorLikeRoleLabel,
  isManagerLikeRoleLabel,
  isSpecialistLikeRoleLabel,
  isTutorLikeRoleLabel,
  joinNormalizedRoleLabelParts,
  normalizeRoleLabel
} from "../src/lib/role-labels.js";
import {
  createMigrationRequiredError,
  getMissingNames
} from "../src/lib/schema-guard.js";
import {
  normalizePermissionCode,
  normalizePermissionCodes
} from "../src/lib/permission-codes.js";
import { normalizeOrganizationCode } from "../src/lib/organization-code.js";
import {
  getNotificationRetentionSettingsByOrganization,
  saveNotificationRetentionSettingsByOrganization
} from "../src/modules/notifications/notifications.service.js";

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

test("normalizePositiveInteger falls back to zero for invalid values", () => {
  assert.equal(normalizePositiveInteger("17"), 17);
  assert.equal(normalizePositiveInteger(null), 0);
  assert.equal(normalizePositiveInteger("bad"), 0);
  assert.equal(normalizePositiveInteger("bad", 9), 9);
});

test("normalizeInteger keeps signed integer fallback semantics", () => {
  assert.equal(normalizeInteger("17"), 17);
  assert.equal(normalizeInteger("-4"), -4);
  assert.equal(normalizeInteger("bad"), 0);
  assert.equal(normalizeInteger("bad", 9), 9);
});

test("toBooleanFlag preserves fallback semantics and optional on support", () => {
  assert.equal(toBooleanFlag(undefined, true), true);
  assert.equal(toBooleanFlag("true", false), true);
  assert.equal(toBooleanFlag("on", false), false);
  assert.equal(toBooleanFlag("on", false, { acceptOn: true }), true);
  assert.equal(toBooleanFlag("unexpected", true), false);
});

test("work schedule helpers normalize scope, day, time and reason", () => {
  assert.equal(normalizeWorkScheduleScope(" weekly "), "weekly");
  assert.equal(normalizeWorkScheduleScope("bad"), "");

  assert.equal(normalizeWorkScheduleDayOfWeek("5"), 5);
  assert.equal(normalizeWorkScheduleDayOfWeek("Tue", (dayKey) => (dayKey === "tue" ? 2 : 0)), 2);
  assert.equal(normalizeWorkScheduleDayOfWeek("bad"), 0);

  assert.equal(normalizeWorkScheduleTime("09:30:00"), "09:30");
  assert.equal(normalizeWorkScheduleTime("99:30"), "");

  assert.equal(normalizeWorkScheduleReason("  note  "), "note");
  assert.equal(normalizeWorkScheduleReason("x".repeat(150)).length, 120);
});

test("vip daily routine helpers normalize aliases and strict values", () => {
  assert.equal(normalizeVipDailyRoutineDayOfWeek("3"), 3);
  assert.equal(normalizeVipDailyRoutineDayOfWeek("dushanba"), 0);
  assert.equal(normalizeVipDailyRoutineDayOfWeek("dushanba", { allowAliases: true }), 1);
  assert.equal(getVipDailyRoutineDayKey(5), "fri");

  assert.equal(normalizeVipClassDailyRoutineActivityType("breakfast"), "breakfast");
  assert.equal(normalizeVipClassDailyRoutineActivityType("lunch"), "lunch");
  assert.equal(normalizeVipClassDailyRoutineActivityType("afternoon-snack"), "afternoon-snack");
  assert.equal(normalizeVipClassDailyRoutineActivityType("ovqat"), "");
  assert.equal(
    normalizeVipClassDailyRoutineActivityType("ovqat", { allowAliases: true }),
    ""
  );
  assert.equal(
    normalizeVipClassDailyRoutineActivityType("nonushta", { allowAliases: true }),
    "breakfast"
  );
  assert.equal(
    normalizeVipClassDailyRoutineActivityType("poldnik", { allowAliases: true }),
    "afternoon-snack"
  );
});

test("parseOptionalOrganizationId accepts empty values and rejects invalid ids", () => {
  assert.deepEqual(parseOptionalOrganizationId(""), { value: null });
  assert.deepEqual(parseOptionalOrganizationId("7"), { value: 7 });
  assert.equal(parseOptionalOrganizationId("bad").error?.field, "organizationId");
});

test("parseBooleanOr falls back when boolean input is invalid", () => {
  assert.equal(parseBooleanOr("on", false), true);
  assert.equal(parseBooleanOr("off", true), false);
  assert.equal(parseBooleanOr("maybe", true), true);
  assert.equal(parseBooleanOr(undefined, false), false);
});

test("normalizeNotificationListLimit clamps invalid or large values", () => {
  assert.equal(normalizeNotificationListLimit(undefined), 50);
  assert.equal(normalizeNotificationListLimit("10"), 10);
  assert.equal(normalizeNotificationListLimit("1000"), 200);
});

test("notification retention helpers share stable range validation", () => {
  assert.equal(getNotificationRetentionDaysMessage(), "Retention days must be an integer between 0 and 3650.");
  assert.deepEqual(parseNotificationRetentionDays("30", "retentionDays"), { value: 30 });
  assert.equal(parseNotificationRetentionDays("-1", "retentionDays").error?.field, "retentionDays");
});

test("appointment schedule helpers normalize durations, reminder channels and scope", () => {
  assert.deepEqual(normalizeDurationOptions("30,30,60,0,2000", { allowCsv: true }), [30, 60]);
  assert.deepEqual(normalizeDurationOptions([15, "30", 15]), [15, 30]);
  assert.deepEqual(normalizeReminderChannels(["sms", "email", "bad"]), ["sms", "email"]);
  assert.equal(normalizeScheduleScope("future"), "future");
  assert.equal(normalizeScheduleScope("bad"), "");
  assert.equal(normalizeScheduleScope("bad", "single"), "single");
});

test("appointment time helpers support strict and seconds-trimmed parsing", () => {
  assert.equal(normalizeTimeHm("09:30"), "09:30");
  assert.equal(normalizeTimeHm("09:30:00"), "");
  assert.equal(normalizeTimeHm("09:30:00", { allowSeconds: true }), "09:30");
  assert.equal(toTimeMinutes("09:30"), 570);
  assert.equal(toTimeMinutes("09:30:00"), null);
  assert.equal(toTimeMinutes("09:30:00", { allowSeconds: true }), 570);
  assert.equal(getDurationMinutesFromTimes("09:30", "10:15"), 45);
  assert.equal(getDurationMinutesFromTimes("09:30:00", "10:15:00", { allowSeconds: true }), 45);
});

test("notification target helpers normalize route and manager-specific targets", () => {
  assert.deepEqual(normalizeNotificationRouteTargetUserIds("7"), [7]);
  assert.deepEqual(normalizeNotificationRouteTargetRoles([" Manager ", "manager", ""]), ["manager"]);
  assert.deepEqual(normalizeManagerNotificationTargetRoles(["manager", "specialist"]), ["manager"]);
});

test("permission code helpers normalize individual codes and unique lists", () => {
  assert.equal(normalizePermissionCode(" Users.Read "), "users.read");
  assert.equal(normalizePermissionCode(""), "");
  assert.deepEqual(
    normalizePermissionCodes([" Users.Read ", "users.read", "", null, "profile.read"]),
    ["users.read", "profile.read"]
  );
});

test("organization code helper normalizes lowercase trimmed values", () => {
  assert.equal(normalizeOrganizationCode(" Main-Office "), "main-office");
  assert.equal(normalizeOrganizationCode(""), "");
  assert.equal(normalizeOrganizationCode(null), "");
});

test("isValidDateYmd validates strict YYYY-MM-DD dates", () => {
  assert.equal(isValidDateYmd("2024-02-29"), true);
  assert.equal(isValidDateYmd("2025-02-29"), false);
  assert.equal(isValidDateYmd("2025-13-01"), false);
  assert.equal(isValidDateYmd("not-a-date"), false);
});

test("date helpers share stable YMD formatting and normalization", () => {
  assert.equal(formatDateYmd(new Date(2025, 2, 9)), "2025-03-09");
  assert.equal(formatDateYmd("2025-03-09"), "");

  assert.equal(normalizeDateYmd(" 2025-03-09 "), "2025-03-09");
  assert.equal(normalizeDateYmd("2025-03-09T10:15"), "");
  assert.equal(normalizeDateYmd("2025-02-29"), "2025-02-29");

  assert.equal(
    normalizeDateYmd("2025-03-09T10:15", { allowPrefix: true, requireValidExact: true }),
    "2025-03-09"
  );
  assert.equal(
    normalizeDateYmd("2025-02-29", { allowDateParsing: true, requireValidExact: true }),
    "2025-03-01"
  );
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

test("getMissingNames reports required names absent from the existing set", () => {
  const missing = getMissingNames(new Set(["event_type", "details"]), [
    "event_type",
    "details",
    "changed_at",
    "changed_by"
  ]);

  assert.deepEqual(missing, ["changed_at", "changed_by"]);
});

test("createMigrationRequiredError sets a stable error code", () => {
  const error = createMigrationRequiredError("Schema update required.", {
    missingTables: ["appointment_status_history"]
  });

  assert.equal(error.code, "MIGRATION_REQUIRED");
  assert.deepEqual(error.details, {
    missingTables: ["appointment_status_history"]
  });
});

test("role label helpers normalize and match localized labels", () => {
  assert.equal(normalizeRoleLabel(" Manager "), "manager");
  assert.equal(joinNormalizedRoleLabelParts(" Director ", "", "Teacher "), "director teacher");

  assert.equal(isManagerLikeRoleLabel("Menejer"), true);
  assert.equal(isDirectorLikeRoleLabel("Директор"), true);
  assert.equal(isSpecialistLikeRoleLabel("Mutaxassis"), true);
  assert.equal(isTutorLikeRoleLabel("Senior Tutor"), true);
  assert.equal(isTutorLikeRoleLabel("Teacher"), false);
});

test("parseNullableBoolean normalizes supported truthy and falsy values", () => {
  assert.equal(parseNullableBoolean(true), true);
  assert.equal(parseNullableBoolean("yes"), true);
  assert.equal(parseNullableBoolean(0), false);
  assert.equal(parseNullableBoolean("off"), false);
  assert.equal(parseNullableBoolean("maybe"), null);
});

test("sendMigrationRequired maps migration errors to a stable 409 response", () => {
  const replyState = {
    statusCode: 200,
    payload: undefined
  };
  const reply = {
    status(code) {
      replyState.statusCode = code;
      return this;
    },
    send(payload) {
      replyState.payload = payload;
      return this;
    }
  };

  const handled = sendMigrationRequired(
    reply,
    createMigrationRequiredError("Schema update required.", {
      missingTables: ["vip_client_attendance"]
    }),
    "Fallback message",
    { includeDetails: true }
  );

  assert.equal(handled, true);
  assert.equal(replyState.statusCode, 409);
  assert.equal(replyState.payload?.code, "MIGRATION_REQUIRED");
  assert.deepEqual(replyState.payload?.details, {
    missingTables: ["vip_client_attendance"]
  });
});

test("notification retention read falls back to defaults when retention columns are missing", async () => {
  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM information_schema.columns")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  };

  try {
    const item = await getNotificationRetentionSettingsByOrganization({
      organizationId: 7,
      defaultOutboxRetentionDays: 45,
      defaultUserNotificationsRetentionDays: 3
    });

    assert.deepEqual(item, {
      organizationId: "7",
      outboxRetentionDays: "45",
      userNotificationsRetentionDays: "3"
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("notification retention save throws migration required when retention columns are missing", async () => {
  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql) => {
    const queryText = String(sql || "");
    if (queryText.includes("FROM information_schema.columns")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${queryText}`);
  };

  try {
    await assert.rejects(
      () => saveNotificationRetentionSettingsByOrganization({
        organizationId: 7,
        outboxRetentionDays: 30,
        userNotificationsRetentionDays: 0
      }),
      (error) => {
        assert.equal(error?.code, "MIGRATION_REQUIRED");
        assert.deepEqual(error?.details, {
          missingColumns: {
            appointment_settings: [
              "outbox_retention_days",
              "user_notifications_retention_days"
            ]
          }
        });
        return true;
      }
    );
  } finally {
    pool.query = originalQuery;
  }
});

test("toBoundedInteger clamps parsed values into the provided range", () => {
  assert.equal(toBoundedInteger("12", 5, 1, 20), 12);
  assert.equal(toBoundedInteger("999", 5, 1, 20), 20);
  assert.equal(toBoundedInteger("-5", 5, 1, 20), 1);
  assert.equal(toBoundedInteger("bad", 5, 1, 20), 5);
});
