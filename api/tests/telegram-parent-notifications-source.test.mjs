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

test("Telegram weekly menu opens day buttons before showing lessons", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /function buildWeekDaysReplyMarkup\([\s\S]*buttons\.push\(\{[\s\S]*text: label[\s\S]*for \(let index = 0; index < buttons\.length; index \+= 2\)[\s\S]*keyboard\.push\(buttons\.slice\(index, index \+ 2\)\)[\s\S]*text: getText\(language, "backToMainMenu"\)[\s\S]*resize_keyboard: true/s,
    "Weekly menu should render weekday buttons as the main keyboard with a back button."
  );
  assert.match(
    serviceSource,
    /const WORK_WEEK_OFFSETS = Object\.freeze\(\[0, 1, 2, 3, 4, 5\]\)/,
    "Weekly menu should only show Monday through Saturday."
  );
  assert.match(
    serviceSource,
    /function resolveWeekdayMenuDate\([\s\S]*getWeekdayLabel\(language, dateYmd\)[\s\S]*return dateYmd/s,
    "Weekly menu day text should resolve to a current-week date."
  );
  assert.match(
    serviceSource,
    /if \(action === "week"\)[\s\S]*await sendWeekDaysMenu\(/,
    "Weekly text action should open the weekday menu first."
  );
  assert.match(
    serviceSource,
    /const selectedWeekdayDate = resolveWeekdayMenuDate\(text, parent\.language\)[\s\S]*dateFrom: selectedWeekdayDate,[\s\S]*dateTo: selectedWeekdayDate/s,
    "Selecting a weekday keyboard button should load lessons only for that date."
  );
  assert.match(
    serviceSource,
    /const selectedWeekdayDate = resolveWeekdayMenuDate\(text, parent\.language\)[\s\S]*return;[\s\S]*const action = resolveMenuAction\(text\)/s,
    "Weekday text should be handled before broad menu matching so Monday is not treated as the week command."
  );
  assert.match(
    serviceSource,
    /replyMarkup: buildWeekDaysReplyMarkup\(parent\.language, selectedWeekdayDate\)[\s\S]*emptyText: getText\(parent\.language, "noLessonsThisDay"\)[\s\S]*includeDateTime: false/s,
    "Selecting a weekday should keep the week keyboard open and omit repeated date/time in lesson rows."
  );
});

test("Telegram main menu keeps children on first row and daily weekly on second row", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /function buildMainMenuReplyMarkup\([\s\S]*keyboard:\s*\[\s*\[\{ text: getText\(language, "menuChildren"\) \}\],\s*\[\{ text: getText\(language, "menuToday"\) \}, \{ text: getText\(language, "menuWeek"\) \}\]/s,
    "Main menu should show children alone on row 1 and today/week together on row 2."
  );
});

test("planner date or time edits notify Telegram parents", async () => {
  const scheduleRoutesSource = await readFile(
    new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
    "utf8"
  );

  assert.match(
    scheduleRoutesSource,
    /function hasScheduleDateTimeChanges\([\s\S]*appointmentDate[\s\S]*startTime[\s\S]*endTime/s,
    "Planner schedule routes should detect date/time-only changes."
  );
  assert.match(
    scheduleRoutesSource,
    /async function notifyScheduleDateTimeEdit\([\s\S]*buildScheduleNotification\("edit"[\s\S]*type: "schedule-updated"/s,
    "Planner date/time edits should send schedule-updated notifications."
  );
  assert.match(
    scheduleRoutesSource,
    /schedulesReadCache\.clear\(\);\s*await notifyScheduleDateTimeEdit\(access, target\.items, items\);/s,
    "Regular planner edits should notify after successful update."
  );
});

test("Telegram coming callback is acknowledged before parent lookup", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /const data = String\(callbackQuery\?\.data \|\| ""\)\.trim\(\);\s*if \(data\.startsWith\("resp:coming:"\)\) \{\s*await answerCallbackQuery\([\s\S]*const parent = await requireParentOrAskContact/s,
    "The 'coming' button should clear Telegram loading before database parent lookup or response saving."
  );
});

test("manual SMS notification broadcast uses role permission and Telegram parents", async () => {
  const routesSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.routes.js", import.meta.url),
    "utf8"
  );
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    routesSource,
    /SMS_NOTIFICATIONS_SEND/,
    "SMS notification sending should be guarded by the role permission."
  );
  assert.match(
    routesSource,
    /"\/sms-notifications\/send"[\s\S]*sendTelegramBroadcastToParents/s,
    "Settings routes should expose the manual SMS notification send endpoint."
  );
  assert.match(
    serviceSource,
    /export async function sendTelegramBroadcastToParents\([\s\S]*FROM telegram_parent_accounts[\s\S]*sendTelegramMessage\(/s,
    "Manual broadcasts should send Telegram messages to linked parent accounts."
  );
  assert.match(
    serviceSource,
    /eventType:\s*"manual-broadcast"/,
    "Manual broadcasts should be logged with their own event type."
  );
});

test("Telegram reminders stay retryable and use enabled reminder windows", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /if \(normalizedDedupeKey\)[\s\S]*SELECT id[\s\S]*await sendTelegramMessage\([\s\S]*const logResult = await logParentMessage/s,
    "Dedupe reminders should check existing logs, then send before writing the log."
  );
  assert.match(
    serviceSource,
    /tbs\.\$\{enabledColumn\} = TRUE[\s\S]*tbs\.\$\{hoursColumn\} > 0[\s\S]*> TIMEZONE\('Asia\/Tashkent', NOW\(\)\)[\s\S]*<= \(TIMEZONE\('Asia\/Tashkent', NOW\(\)\) \+ \(tbs\.\$\{hoursColumn\}::text \|\| ' hours'\)::interval\)[\s\S]*NOT EXISTS/s,
    "Reminder sweep should find upcoming unsent reminders within the configured window."
  );
  assert.match(
    serviceSource,
    /async function sendReminderRows\([\s\S]*for \(const row of Array\.isArray\(rows\) \? rows : \[\]\)[\s\S]*try \{[\s\S]*await sendReminderRow\(\{ row, reminderType \}\);[\s\S]*catch \(error\)[\s\S]*Telegram reminder row failed/s,
    "Reminder sweep should continue sending other rows when one Telegram chat fails."
  );
  assert.match(
    serviceSource,
    /await sendReminderRows\(\{[\s\S]*reminderType: "reminder_24h"[\s\S]*await sendReminderRows\(\{[\s\S]*reminderType: "reminder_2h"/s,
    "Both reminder windows should use the retryable per-row sender."
  );
  assert.match(
    serviceSource,
    /export function startTelegramReminderWorker[\s\S]*void runTelegramReminderSweep\(\{ logger \}\);[\s\S]*setInterval\(\(\) => \{/,
    "Reminder worker should run once immediately on startup, then continue on the interval."
  );
  assert.match(
    serviceSource,
    /replyMarkup:\s*reminderType === "reminder_24h" \? buildAppointmentButtons\(language, item\.id\) : null/,
    "Only the first reminder should ask parents to confirm attendance."
  );
  assert.match(
    serviceSource,
    /const template = settings\.templates\?\.\[language\]\?\.\[templateKey\] \|\| DEFAULT_TEMPLATES\[language\]\[templateKey\]/,
    "Reminder messages should use the editable Telegram settings template before falling back to defaults."
  );
  assert.match(
    serviceSource,
    /reminder2h:\s*"Сегодня в \{time\} у вас урок \{service\}\. Специалист: \{specialist\}\."/,
    "Second reminder should be a short informational message with the specialist name and without a question."
  );
});
