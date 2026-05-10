import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("planner delete context reaches Telegram parent notifications", async () => {
  const accessSource = await readFile(
    new URL("../src/modules/appointments/appointment-route-access.js", import.meta.url),
    "utf8"
  );
  const scheduleRoutesSource = await readFile(
    new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
    "utf8"
  );

  assert.match(
    accessSource,
    /notifyTelegramParentsForAppointmentChange\(\{[\s\S]*notificationContext:\s*payloadData/s,
    "Appointment broadcaster should pass delete scope/count context to Telegram notifications."
  );
  assert.match(
    scheduleRoutesSource,
    /type:\s*"schedule-deleted"[\s\S]*data:\s*\{[\s\S]*\.\.\.scheduleNotification\.data,[\s\S]*scope:\s*target\.scope,[\s\S]*deletedCount/s,
    "Planner delete notifications should include scope and deletedCount."
  );
});

test("Telegram parent notifications collapse recurring deletes into one message", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /scheduleSeriesDeleted:\s*"\{child\} uchun \{service\} darslari bekor qilindi\."/,
    "Telegram defaults should include a compact Uzbek series-delete template."
  );
  assert.match(
    serviceSource,
    /function isSeriesDeleteNotification\([\s\S]*scope !== "future" && scope !== "all"[\s\S]*deletedCount > 1 \|\| items\.length > 1/s,
    "Telegram service should detect non-single multi-item delete notifications."
  );
  assert.match(
    serviceSource,
    /if \(isSeriesDeleteNotification\([\s\S]*for \(const group of buildSeriesDeleteGroups\(normalizedItems\)\)[\s\S]*appointmentScheduleId:\s*null/s,
    "Telegram service should send grouped series-delete messages instead of per-slot messages."
  );
  assert.match(
    serviceSource,
    /specialistLessonsDeleted:\s*"\{child\} uchun rejalashtirilgan darslar bekor qilindi\."/,
    "Telegram defaults should include a compact specialist-removal template."
  );
  assert.match(
    serviceSource,
    /if \(isSpecialistLessonsDeleteNotification\([\s\S]*for \(const group of buildClientDeleteGroups\(normalizedItems\)\)[\s\S]*appointmentScheduleId:\s*null/s,
    "Telegram service should collapse specialist-removal appointment deletes by child."
  );
});

test("Telegram parent notifications collapse recurring creates into one weekly message", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );
  const routeHelpersSource = await readFile(
    new URL("../src/modules/appointments/appointment-route-helpers.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /scheduleCreatedWeek:\s*"\{child\} uchun yaqin haftalik darslar rejalashtirildi:\\n\{lessons\}"/,
    "Telegram defaults should include a compact Uzbek weekly-create template."
  );
  assert.match(
    routeHelpersSource,
    /repeatGroupKey:\s*item\?\.repeatGroupKey[\s\S]*isRecurring:\s*item\?\.isRecurring/s,
    "Schedule notifications should carry recurring metadata to Telegram."
  );
  assert.match(
    serviceSource,
    /function isRecurringCreateNotification\([\s\S]*isCreatedEvent\(eventType\)[\s\S]*items\.some\(\(item\) => item\.isRecurring \|\| item\.repeatGroupKey \|\| item\.repeatType === "weekly"\)/s,
    "Telegram service should detect multi-item recurring create notifications."
  );
  assert.match(
    serviceSource,
    /if \(isRecurringCreateNotification\([\s\S]*for \(const group of buildRecurringCreateGroups\(normalizedItems\)\)[\s\S]*appointmentScheduleId:\s*null/s,
    "Telegram service should send one weekly create message instead of per-slot messages."
  );
});

test("specialist removal planner cleanup notifies Telegram parents after commit", async () => {
  const usersServiceSource = await readFile(
    new URL("../src/modules/users/users.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    usersServiceSource,
    /import \{ notifyTelegramParentsForAppointmentChange \} from "\.\.\/telegram-bot\/telegram-bot\.service\.js";/,
    "User cleanup should be able to notify Telegram parents."
  );
  assert.match(
    usersServiceSource,
    /eventType:\s*"specialist-lessons-deleted"[\s\S]*scope:\s*"specialist_removed"/,
    "Specialist cleanup should use the compact specialist-lessons-deleted event."
  );
  assert.match(
    usersServiceSource,
    /const user = await executeTransaction[\s\S]*await sendSpecialistLessonsDeletedNotification\(specialistLessonsDeletedNotification\);[\s\S]*return user;/,
    "Role-change cleanup should notify parents after the database transaction has completed."
  );
  assert.match(
    usersServiceSource,
    /const result = await executeTransaction[\s\S]*await sendSpecialistLessonsDeletedNotification\(specialistLessonsDeletedNotification\);[\s\S]*return result;/,
    "User-delete cleanup should notify parents after the database transaction has completed."
  );
});
