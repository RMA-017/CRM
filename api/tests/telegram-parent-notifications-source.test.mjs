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
  const settingsServiceSource = await readFile(
    new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
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
  assert.match(
    settingsServiceSource,
    /export async function getAppointmentScheduleTargetsByScope[\s\S]*COALESCE\(NULLIF\(TRIM\(u\.full_name\), ''\), NULLIF\(TRIM\(u\.username\), ''\), CONCAT\('Specialist #', s\.specialist_id::text\)\) AS specialist_name[\s\S]*specialistName: String\(row\?\.specialist_name \|\| ""\)\.trim\(\)/s,
    "Planner delete target items should carry the real specialist name to Telegram notifications."
  );
});

test("Telegram parent notifications collapse recurring deletes into one message", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /scheduleSeriesDeleted:\s*"\{child\} uchun \{service\} darslari bekor qilindi\. Mutaxassis: \{specialist\}\."/,
    "Telegram defaults should include service and specialist in the compact Uzbek series-delete template."
  );
  assert.match(
    serviceSource,
    /function getSpecialistName\(item\)[\s\S]*item\?\.specialistName,[\s\S]*item\?\.specialist_name,[\s\S]*item\?\.specialistFullName,[\s\S]*!isFallbackSpecialistName\(value\)[\s\S]*Specialist #\$\{specialistId\}/s,
    "Telegram specialist name resolver should prefer real specialist names and fall back to a numbered specialist."
  );
  assert.match(
    serviceSource,
    /async function hydrateNotificationSpecialistNames\([\s\S]*COALESCE\(NULLIF\(TRIM\(full_name\), ''\), NULLIF\(TRIM\(username\), ''\), CONCAT\('Specialist #', id::text\)\) AS specialist_name[\s\S]*FROM users[\s\S]*normalizedItems = await hydrateNotificationSpecialistNames/s,
    "Telegram notification items with missing specialist names should be hydrated from users before messages are built."
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
    /specialistLessonsDeleted:\s*"\{child\} uchun rejalashtirilgan darslar bekor qilindi:\\n\{lessons\}"/,
    "Telegram defaults should include lesson lines with service and specialist in specialist-removal messages."
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
    serviceSource,
    /function appendRequiredAppointmentParts\([\s\S]*serviceText[\s\S]*Dars[\s\S]*specialistText[\s\S]*Mutaxassis/s,
    "Telegram appointment messages should append missing service and specialist names for saved custom templates."
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

test("Telegram parent notifications collapse recurring schedule updates into one message", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );
  const settingsPanelSource = await readFile(
    new URL("../../web/src/pages/profile/panels/TelegramBotSettingsPanel.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /scheduleSeriesChanged:\s*"\{child\} uchun \{service\} darslari jadvali o'zgartirildi\. Mutaxassis: \{specialist\}\. Yangi vaqt: \{time\}\. Sana: \{dateFrom\} - \{dateTo\}\."/,
    "Telegram defaults should include a compact Uzbek series-update template."
  );
  assert.match(
    serviceSource,
    /function isRecurringUpdateNotification\([\s\S]*type\.includes\("updated"\)[\s\S]*statusChangedTo[\s\S]*items\.length > 1[\s\S]*item\.isRecurring \|\| item\.repeatGroupKey \|\| item\.repeatType === "weekly"/s,
    "Telegram service should detect multi-item recurring schedule updates and ignore cancelled-status updates."
  );
  assert.match(
    serviceSource,
    /function buildSeriesUpdateGroups\([\s\S]*item\.clientId[\s\S]*item\.serviceName[\s\S]*getSpecialistName\(item\)[\s\S]*items: group\.items\.sort\(compareNotificationItemsByDateTime\)/s,
    "Recurring schedule updates should be grouped by child, service, and specialist."
  );
  assert.match(
    serviceSource,
    /if \(isRecurringUpdateNotification\([\s\S]*for \(const group of buildSeriesUpdateGroups\(normalizedItems\)\)[\s\S]*appointmentScheduleId:\s*null/s,
    "Telegram service should send grouped recurring update messages instead of per-slot messages."
  );
  assert.match(
    settingsPanelSource,
    /scheduleSeriesChanged:\s*""[\s\S]*\["scheduleSeriesChanged", "scheduleSeriesChanged"\][\s\S]*scheduleSeriesChanged:\s*"Seriyali darslar o'zgardi"[\s\S]*scheduleSeriesChanged:\s*"Серия занятий изменена"/s,
    "Telegram settings UI should expose the series-update template in both languages."
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
    /function buildWeekDaysReplyMarkup\([\s\S]*callback_data: `week_day:\$\{dateYmd\}`[\s\S]*const inlineKeyboard = \[[\s\S]*weekPrevious[\s\S]*callback_data: `week_nav:\$\{previousWeekStart\}`[\s\S]*weekNext[\s\S]*callback_data: `week_nav:\$\{nextWeekStart\}`[\s\S]*inlineKeyboard\.push\(buttons\.slice\(index, index \+ 2\)\)[\s\S]*inline_keyboard: inlineKeyboard/s,
    "Weekly menu should render weekday inline buttons with previous and next controls."
  );
  assert.match(
    serviceSource,
    /const WORK_WEEK_OFFSETS = Object\.freeze\(\[0, 1, 2, 3, 4, 5\]\)/,
    "Weekly menu should only show Monday through Saturday."
  );
  assert.match(
    serviceSource,
    /async function sendWeekDaysMenu\([\s\S]*messageId = null[\s\S]*setParentWeekMenuState\(parent, startDate\)[\s\S]*editTelegramMessageOrSend\(\{[\s\S]*messageId[\s\S]*formatWeekInterval\(weekStartDate\)[\s\S]*replyMarkup: buildWeekDaysReplyMarkup\(parent\.language, weekStartDate\)/s,
    "Weekly menu should save state, show the selected week interval, and edit the same inline message when possible."
  );
  assert.match(
    serviceSource,
    /if \(action === "week"\)[\s\S]*await sendWeekDaysMenu\(/,
    "Weekly text action should open the weekday menu first."
  );
  assert.match(
    serviceSource,
    /const weekNavigationAction = resolveWeekNavigationAction\(text, parent\.language\)[\s\S]*getParentWeekMenuState\(parent\)[\s\S]*shiftDateYmd\(currentWeekStart, weekNavigationAction === "previous" \? -7 : 7\)[\s\S]*return;/s,
    "Previous and next week reply-keyboard controls should reopen the weekday menu for that week."
  );
  assert.match(
    serviceSource,
    /const selectedWeekdayDate = resolveWeekdayMenuDate\(text, parent\.language, getParentWeekMenuState\(parent\)\)[\s\S]*await sendWeekDaySchedule\([\s\S]*dateYmd: selectedWeekdayDate[\s\S]*return;[\s\S]*const action = resolveMenuAction\(text\)/s,
    "Weekday text should use the saved week and be handled before broad menu matching."
  );
  assert.match(
    serviceSource,
    /if \(data\.startsWith\("week_day:"\)\)[\s\S]*await sendWeekDaySchedule\(\{[\s\S]*dateYmd: selectedDate,[\s\S]*messageId: callbackMessageId[\s\S]*\}\);[\s\S]*return;/s,
    "Selecting a weekday should edit the inline weekly message into the simplified day view."
  );
  assert.match(
    serviceSource,
    /function buildWeekDayActionsReplyMarkup\(language, dateYmd, items = \[\], options = \{\}\)[\s\S]*weekAllComing[\s\S]*week_cancel_day:\$\{dateYmd\}[\s\S]*week_cancel_one:\$\{dateYmd\}[\s\S]*options\.includeBack !== false[\s\S]*backToWeekMenu[\s\S]*week_menu:\$\{getWeekStartDateYmd\(dateYmd\)\}/s,
    "Weekly day actions should expose day-level controls and a return button to the inline week menu."
  );
  assert.match(
    serviceSource,
    /async function sendWeekDaySchedule\([\s\S]*editTelegramMessageOrSend\(\{[\s\S]*messageId[\s\S]*replyMarkup: buildWeekDayReplyMarkup\(parent\.language, selectedDate, items\)/s,
    "Plain weekly day view should edit the same inline message and keep week navigation available."
  );
  assert.match(
    serviceSource,
    /function formatWeekDayScheduleMessage\([\s\S]*`\$\{index \+ 1\}\. \$\{item\.startTime\} - \$\{getClientName\(item\)\} - \$\{item\.serviceName\}\$\{statusText\}`[\s\S]*function sendChildrenList/s,
    "Weekly day lesson rows should include the child name before the service name."
  );
  assert.match(
    serviceSource,
    /function buildWeekCancelOneReplyMarkup\([\s\S]*text: `\$\{item\.startTime\} \$\{getClientName\(item\)\} - \$\{item\.serviceName\}`\.trim\(\)/s,
    "Weekly single-lesson cancellation choices should include the child name."
  );
  assert.match(
    serviceSource,
    /if \(data\.startsWith\("week_cancel_day_confirm:"\)\)[\s\S]*await setPendingCancelDayReason\([\s\S]*appointmentIds: items\.map\(\(item\) => item\.id\),[\s\S]*telegramMessageId: callbackMessageId[\s\S]*editTelegramMessageOrSend\(\{[\s\S]*replyMarkup: buildDayCancelReasonButtons\(parent\.language, selectedDate\)/s,
    "Day-level cancellation should require confirmation, remember the inline message, and then reuse the reason flow."
  );
  assert.match(
    serviceSource,
    /async function editTelegramMessageOrSend\([\s\S]*editTelegramMessageText[\s\S]*sendTelegramMessage/s,
    "Inline weekly navigation should prefer editing the same Telegram message and fall back to sending if Telegram rejects the edit."
  );
  assert.match(
    serviceSource,
    /if \(data\.startsWith\("week_cancel_single:"\)\)[\s\S]*setPendingCancelReason\(\{[\s\S]*telegramMessageId: callbackMessageId[\s\S]*buildWeekSingleCancelReasonButtons/s,
    "Single-lesson cancellation from the weekly flow should also keep the reason prompt inside the same inline message."
  );
  assert.match(
    serviceSource,
    /async function notifyStaffAboutParentDayCancel\([\s\S]*const firstSpecialistName = getSpecialistName\(firstAppointment\)[\s\S]*eventType: "appointment-parent-cancelled"[\s\S]*targetUserIds: \[firstAppointment\.specialistId\]\.filter\(Boolean\)[\s\S]*targetRoles: \["manager"\][\s\S]*specialistName: firstSpecialistName[\s\S]*cancelledCount: groupItems\.length[\s\S]*specialistName: getSpecialistName\(item\)/s,
    "Day-level cancellations should notify the responsible specialist and manager-role users with specialist details."
  );
  assert.match(
    serviceSource,
    /async function notifyStaffAboutParentCancel\([\s\S]*eventType: "appointment-parent-cancelled"[\s\S]*targetUserIds: \[appointment\.specialistId\]\.filter\(Boolean\)[\s\S]*targetRoles: \["manager"\]/s,
    "Single parent cancellations should target the responsible specialist and manager-role users."
  );
  assert.match(
    serviceSource,
    /const scheduleNote = prefixAppointmentCancellationNote\(normalizedReason, "Parent"\)[\s\S]*status: "cancelled",[\s\S]*note: scheduleNote/s,
    "Parent cancellations should store a source-prefixed appointment note."
  );
  assert.doesNotMatch(
    serviceSource,
    /targetPermissionCodes: settings\.managerNotificationPermissionCodes/,
    "Parent cancellation staff notifications should not fan out through broad notification permissions."
  );
  assert.match(
    serviceSource,
    /weekDayComingSaved:\s*"\{date\} dagi barcha darslar uchun javob saqlandi: kelamiz\."[\s\S]*weekDayCancelSaved:\s*"\{date\} dagi \{count\} ta dars bekor qilindi\."[\s\S]*weekDayComingSaved:\s*"Ответ сохранен: придем на все занятия \{date\}\."[\s\S]*weekDayCancelSaved:\s*"\{count\} занятий на \{date\} отменено\."/s,
    "Weekly bulk parent confirmation replies should stay short and not repeat lesson lists."
  );
  assert.doesNotMatch(
    serviceSource,
    /weekDayComingSaved[\s\S]*lessons: formatAppointmentSummaryLines\(items\)|weekDayCancelSaved[\s\S]*lessons: formatAppointmentSummaryLines\(items\)/,
    "Weekly bulk confirmation replies should not append appointment summary lines."
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
  assert.match(
    serviceSource,
    /function buildMainMenuReplyMarkup\([\s\S]*\[\{ text: getText\(language, "menuServices"\) \}, \{ text: getText\(language, "menuSpecialists"\) \}\],[\s\S]*\[\{ text: getText\(language, "menuSettings"\) \}\]/s,
    "Main menu should show services and specialists together on row 3 before settings."
  );
  assert.match(
    serviceSource,
    /if \(action === "services"\)[\s\S]*await sendServicesList\(\{ settings, parent \}\);[\s\S]*if \(action === "specialists"\)[\s\S]*await sendSpecialistsList\(\{ settings, parent \}\);/s,
    "Services and specialists menu actions should send their linked site content."
  );
  assert.match(
    serviceSource,
    /import \{ listPublicSiteContentItems \} from "\.\.\/site-content\/site-content\.service\.js";[\s\S]*async function sendSpecialistsList[\s\S]*listPublicSiteContentItems\(\)/s,
    "The specialists bot menu should read the public website team content."
  );
});

test("Header notifications keep appointment details compact and specialist-focused", async () => {
  const headerSource = await readFile(
    new URL("../../web/src/pages/profile/HeaderNotifications.jsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    headerSource,
    /getNotificationServiceName/,
    "Header notification rendering should not expose appointment service names."
  );
  assert.match(
    headerSource,
    /const details = compactParts\(\[getNotificationKind\(item, language\), specialistName, dateTime, countText\]\)/,
    "Header notification details should use kind, specialist, date/time, and count."
  );
  assert.match(
    headerSource,
    /if \(eventType === "appointment-parent-cancelled"\)[\s\S]*return `\$\{isRu \? "Родитель отменил" : "Ota-ona bekor qildi"\}: \$\{suffix\}\$\{reasonText\}`\.trim\(\);/s,
    "Parent cancellation notification fallback should include the compact specialist-focused suffix."
  );
});

test("planner date or time edits notify Telegram parents", async () => {
  const scheduleRoutesSource = await readFile(
    new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
    "utf8"
  );
  const settingsServiceSource = await readFile(
    new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
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
  assert.match(
    settingsServiceSource,
    /export async function updateAppointmentSchedulesByIds[\s\S]*FROM updated u[\s\S]*COALESCE\(NULLIF\(TRIM\(specialist_u\.full_name\), ''\), NULLIF\(TRIM\(specialist_u\.username\), ''\), CONCAT\('Specialist #', u\.specialist_id::text\)\) AS specialist_name[\s\S]*return \(rows \|\| \[\]\)\.map\(toScheduleItem\);/s,
    "Regular planner edit results should carry the real specialist name to Telegram notifications."
  );
  assert.match(
    settingsServiceSource,
    /export async function updateAppointmentScheduleByIdWithRepeatMeta[\s\S]*FROM updated u[\s\S]*COALESCE\(NULLIF\(TRIM\(specialist_u\.full_name\), ''\), NULLIF\(TRIM\(specialist_u\.username\), ''\), CONCAT\('Specialist #', u\.specialist_id::text\)\) AS specialist_name[\s\S]*return rows\[0\] \? toScheduleItem\(rows\[0\]\) : null;/s,
    "Recurring planner edit results should carry the real specialist name to Telegram notifications."
  );
});

test("planner status cancellation notifies Telegram parents without user notifications", async () => {
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
    /export async function notifyAppointmentParentsOnly[\s\S]*notifyTelegramParentsForAppointmentChange\(\{[\s\S]*eventType:\s*type,[\s\S]*notificationContext:\s*normalizedData/s,
    "Parent-only appointment notifications should bypass persisted user notifications."
  );
  assert.match(
    scheduleRoutesSource,
    /function getNewlyCancelledScheduleItems[\s\S]*previous\?\.status[\s\S]*!== "cancelled"[\s\S]*item\?\.status[\s\S]*=== "cancelled"/s,
    "Schedule updates should detect newly cancelled appointments."
  );
  assert.match(
    scheduleRoutesSource,
    /async function notifyScheduleCancellationToParents[\s\S]*notifyAppointmentParentsOnly\(access,\s*\{[\s\S]*type:\s*"schedule-updated"[\s\S]*statusChangedTo:\s*"cancelled"/s,
    "Newly cancelled appointments should notify Telegram parents with the cancelled status context."
  );
});

test("planner status cancellation skips parents who already cancelled the lesson", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /async function hasParentNotComingResponse[\s\S]*FROM appointment_parent_responses[\s\S]*response_status = 'not_coming'/s,
    "Telegram parent cancellation notifications should be able to detect parent not-coming responses."
  );
  assert.match(
    serviceSource,
    /const shouldSkipCancelledParentNotification = async[\s\S]*statusChangedTo[\s\S]*"cancelled"[\s\S]*hasParentNotComingResponse/s,
    "Planner status cancellation should skip Telegram parents who already marked the same lesson as not coming."
  );
  assert.match(
    serviceSource,
    /for \(const parent of parents\) \{[\s\S]*if \(await shouldSkipCancelledParentNotification\(\{ parent, item \}\)\) \{[\s\S]*continue;[\s\S]*\}[\s\S]*buildParentNotificationMessage/s,
    "Skipped parent cancellations should not build or send the duplicate cancellation message."
  );
});

test("planner specialist range bulk cancellation groups Telegram parent messages", async () => {
  const [scheduleRoutesSource, settingsServiceSource, telegramServiceSource, routeSchemaSource] = await Promise.all([
    readFile(new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/appointment.route-schemas.js", import.meta.url), "utf8")
  ]);

  assert.match(
    routeSchemaSource,
    /scheduleBulkCancelBody:[\s\S]*required:\s*\["specialistId", "dateFrom", "dateTo"\][\s\S]*reason:\s*\{ type: "string", maxLength: 255 \}/s,
    "Bulk cancellation should validate specialist, date range, and reason."
  );
  assert.match(
    settingsServiceSource,
    /export async function cancelAppointmentSchedulesForSpecialistRange[\s\S]*appointment_date BETWEEN \$3::date AND \$4::date[\s\S]*status IN \('pending', 'confirmed'\)[\s\S]*status = 'cancelled'/s,
    "Bulk cancellation should cancel active specialist lessons across the selected date range."
  );
  assert.match(
    scheduleRoutesSource,
    /fastify\.post\(\s*"\/schedules\/bulk-cancel"[\s\S]*cancelAppointmentSchedulesForSpecialistRange[\s\S]*notifyAppointmentParentsOnly\(access,\s*\{[\s\S]*bulkSpecialistCancellation:\s*true[\s\S]*cancellationScope:\s*"specialist_range"/s,
    "Planner bulk cancellation endpoint should send one parent-notification context for the whole operation."
  );
  assert.match(
    telegramServiceSource,
    /specialistLessonsCancelled:\s*"\{child\} uchun quyidagi darslar bekor qilindi:\\n\{lessons\}\\nSabab: \{reason\}"/,
    "Telegram defaults should include a grouped Uzbek specialist cancellation template."
  );
  assert.match(
    telegramServiceSource,
    /function isBulkSpecialistCancellationNotification[\s\S]*statusChangedTo === "cancelled"[\s\S]*cancellationScope === "specialist_range"[\s\S]*items\.length > 1/s,
    "Telegram service should detect planner specialist range cancellations."
  );
  assert.match(
    telegramServiceSource,
    /if \(isBulkSpecialistCancellationNotification\([\s\S]*for \(const group of buildClientDeleteGroups\(normalizedItems\)\)[\s\S]*shouldSkipCancelledParentNotification[\s\S]*buildSpecialistLessonsCancelledNotificationMessage[\s\S]*appointmentScheduleId:\s*null/s,
    "Telegram service should group bulk cancellation messages by child while preserving duplicate-cancel skips."
  );
});

test("Telegram parent single cancellation only updates the selected lesson", async () => {
  const [serviceSource, settingsServiceSource] = await Promise.all([
    readFile(
      new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
      "utf8"
    )
  ]);
  const singleCancelMatch = serviceSource.match(
    /async function cancelParentAppointment[\s\S]*?\nasync function getPendingDayCancelAppointments/
  );

  assert.ok(singleCancelMatch, "Telegram service should keep the single parent cancel flow discoverable.");
  assert.match(
    singleCancelMatch[0],
    /updateAppointmentSchedulesByIds\(\{[\s\S]*ids: \[appointment\.id\],[\s\S]*status: "cancelled"[\s\S]*note: scheduleNote/s,
    "Single parent cancellations should update only the selected appointment id."
  );
  assert.doesNotMatch(
    singleCancelMatch[0],
    /repeatGroupKey|repeat_group_key|seriesItems|scope: "all"|scope: "future"/,
    "Single parent cancellations should not use recurring-series metadata or series scopes."
  );
  assert.match(
    settingsServiceSource,
    /export async function updateAppointmentSchedulesByIds[\s\S]*clearRepeatMeta = false[\s\S]*WHERE s\.organization_id = \$13[\s\S]*AND s\.id = ANY\(\$14::integer\[\]\)[\s\S]*repeat_group_key = CASE WHEN \$12::boolean THEN NULL ELSE s\.repeat_group_key END/s,
    "The schedule update helper should constrain updates by explicit ids and preserve repeat metadata unless explicitly cleared."
  );
});

test("Telegram parent cancel shows already-cancelled text for specialist-cancelled lessons", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /alreadyCancelled:\s*"Bu dars allaqachon bekor qilingan\."/,
    "Uzbek bot text should explain that the lesson is already cancelled."
  );
  assert.match(
    serviceSource,
    /alreadyCancelled:\s*"Это занятие уже отменено\."/,
    "Russian bot text should explain that the lesson is already cancelled."
  );
  assert.match(
    serviceSource,
    /function getInactiveCancelText\(language, appointment\)[\s\S]*appointment\?\.status[\s\S]*"cancelled"[\s\S]*getText\(language, "alreadyCancelled"\)[\s\S]*getText\(language, "notFound"\)/s,
    "Inactive cancel responses should distinguish cancelled lessons from missing lessons."
  );
  assert.match(
    serviceSource,
    /async function cancelParentAppointment[\s\S]*!appointment \|\| !ACTIVE_APPOINTMENT_STATUSES\.has\(appointment\.status\)[\s\S]*text: getInactiveCancelText\(parent\.language, appointment\)/s,
    "Final parent cancellation should show already-cancelled text when the specialist cancelled first."
  );
  assert.match(
    serviceSource,
    /if \(data\.startsWith\("week_cancel_single:"\)\)[\s\S]*!appointment \|\| !ACTIVE_APPOINTMENT_STATUSES\.has\(appointment\.status\)[\s\S]*text: getInactiveCancelText\(parent\.language, appointment\)/s,
    "Weekly single-cancel should show already-cancelled text before asking for a reason."
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

test("Telegram contact link uses the user's Telegram language", async () => {
  const serviceSource = await readFile(
    new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    serviceSource,
    /function normalizeTelegramUserLanguage\([\s\S]*normalized\.startsWith\("ru"\)[\s\S]*return "ru"[\s\S]*normalized\.startsWith\("uz"\)[\s\S]*return "uz"/,
    "Telegram user language should recognize Russian and Uzbek language_code values."
  );
  assert.match(
    serviceSource,
    /async function handleContactMessage[\s\S]*const language = normalizeTelegramUserLanguage\(from\.language_code, settings\.defaultLanguage\)/,
    "Contact linking should save the parent language from Telegram language_code before sending the main menu."
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
    /reminder24h:\s*"\{date\} в \{time\} урок \{service\}\. Специалист: \{specialist\}\. Вы придете\?"/,
    "First reminder should include both service and specialist before asking parents to confirm attendance."
  );
  assert.match(
    serviceSource,
    /reminder2h:\s*"Сегодня в \{time\} у вас урок \{service\}\. Специалист: \{specialist\}\."/,
    "Second reminder should be a short informational message with the specialist name and without a question."
  );
});
