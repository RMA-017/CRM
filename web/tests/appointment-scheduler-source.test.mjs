import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Appointment scheduler supports client-focused multi-specialist planner view", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /\/api\/appointments\/report\/filters\?includeAllClients=true/,
    "Appointment scheduler should load all planner clients so the Client filter works for VIP and non-VIP records."
  );
  assert.match(
    source,
    /clientFocusedSchedulesBySpecialist/,
    "Appointment scheduler should keep client-focused appointments grouped by specialist."
  );
  assert.match(
    source,
    /clientId:\s*normalizedSelectedPlannerClientFilterId/,
    "Appointment scheduler should request schedules by selected client id."
  );
  assert.match(
    source,
    /id=\"appointmentPlannerClientFilterSelect\"[\s\S]*?searchable[\s\S]*?searchThreshold=\{0\}/,
    "Client filter should expose search input in the planner toolbar."
  );
  assert.doesNotMatch(
    source,
    /label:\s*"All clients"/,
    "Client filter should not include an All clients option."
  );
  assert.match(
    source,
    /<AppointmentPlannerGrid[\s\S]*cardDisplayMode=\"client\"[\s\S]*wrapperClassName=\"appointment-grid-wrap-client\"/s,
    "Client-focused planner should use the editable appointment grid with the no-vertical-scroll wrapper class."
  );
  assert.match(
    source,
    /<AppointmentPlannerGrid[\s\S]*rawAppointmentsByDay=\{rawAppointmentsByDay\}[\s\S]*blockedTimesForSpecialist=\{blockedTimesForSpecialist\}[\s\S]*canCreateOnSpecialist=\{canCreateOnPlannerSpecialist\(selectedSpecialistId\)\}/s,
    "Specialist mode should reuse the shared appointment planner grid with specialist-specific blocked times and create access."
  );
  assert.match(
    source,
    /<AppointmentPlannerGrid[\s\S]*rawAppointmentsByDay=\{clientFocusedAppointmentsByDay\}[\s\S]*breaksForSpecialist=\{breaksForSpecialist\}[\s\S]*blockedTimesForSpecialist=\{blockedTimesForSpecialist\}[\s\S]*absencesForSpecialist=\{absencesForSpecialist\}[\s\S]*canCreateOnSpecialist=\{canOpenClientFocusedCreateModal\}/s,
    "Client-focused mode should still reuse the shared grid while create stays available from the client view."
  );
  assert.match(
    source,
    /<AppointmentPlannerGrid[\s\S]*onOpenCreateModal=\{openCreateModal\}/s,
    "Client-focused planner should reuse the main planner modal for editing appointments from the grid."
  );
  assert.match(
    source,
    /!vipOnly[\s\S]*&& !isClientFocusedMode[\s\S]*&& String\(selectedSpecialistId \|\| ""\)\.trim\(\)/s,
    "Planner settings should stop following the selected specialist once the planner switches into client-focused mode."
  );
  assert.match(
    source,
    /const breaksForSpecialist = vipOnly \|\| isClientFocusedMode\s*\? \[\]\s*:\s*\(breaksBySpecialist\[selectedSpecialistId\] \|\| \[\]\);/s,
    "Client-focused mode should clear specialist break overlays from the grid."
  );
  assert.match(
    source,
    /const absencesForSpecialist = \([\s\S]*vipOnly[\s\S]*\|\|\s*isClientFocusedMode[\s\S]*\? \[\][\s\S]*:\s*\(absencesBySpecialist\[selectedSpecialistId\] \|\| \[\]\);/s,
    "Client-focused mode should clear specialist absence overlays from the grid."
  );
  assert.match(
    source,
    /const blockedTimesForSpecialist = useMemo\(\(\) => \(\s*\(vipOnly \|\| isClientFocusedMode\) \? \[\] : normalizePlannerBlockedTimeItems\(settings\.blockedTimes\)\s*\)/s,
    "Client-focused mode should clear specialist blocked-time overlays from the grid."
  );
  assert.doesNotMatch(
    source,
    /if \(!vipOnly && normalizedSelectedPlannerClientFilterId\) \{\s*return "";\s*\}/s,
    "Client-focused mode should keep the chosen specialist instead of clearing it."
  );
  assert.match(
    source,
    /onChange=\{\(nextValue\) => \{[\s\S]*const nextSpecialistId = String\(nextValue \|\| ""\)\.trim\(\);[\s\S]*setWeekOffset\(0\);[\s\S]*setSelectedSpecialistId\(nextSpecialistId\);[\s\S]*if \(nextSpecialistId\) \{[\s\S]*setSelectedPlannerClientFilterId\(""\);[\s\S]*\}/s,
    "Selecting a specialist in the toolbar should reset to the current week and clear the client filter."
  );
  assert.match(
    source,
    /onChange=\{\(nextValue\) => \{[\s\S]*const nextClientId = String\(nextValue \|\| ""\)\.trim\(\);[\s\S]*setWeekOffset\(0\);[\s\S]*setSelectedPlannerClientFilterId\(nextClientId\);[\s\S]*if \(nextClientId\) \{[\s\S]*setSelectedSpecialistId\(""\);[\s\S]*\}/s,
    "Selecting a client in the toolbar should reset to the current week and clear the specialist filter."
  );
  assert.match(
    source,
    /const isClientFocusedCreateContext = !isEditMode && isClientFocusedMode;[\s\S]*if \(!slotSpecialistId && !isClientFocusedCreateContext\)/s,
    "Client-focused create should open without requiring a toolbar specialist while specialist mode still keeps the old guard."
  );
  assert.match(
    source,
    /isClientFocusedCreateMode \? \([\s\S]*id="appointmentCreateSpecialistSelect"[\s\S]*options=\{clientFocusedCreateSpecialistOptions\}/s,
    "Client-focused To Planner modal should replace the client name search with a specialist select."
  );
  assert.match(
    source,
    /const clientFocusedModalPreviewSpecialistId = \([\s\S]*createModal\.open[\s\S]*String\(createModal\.specialistId \|\| ""\)\.trim\(\)/s,
    "Client-focused planner should derive a preview specialist id from the modal selection without reviving the toolbar specialist filter."
  );
  assert.match(
    source,
    /apiFetch\(`\/api\/appointments\/settings\?\$\{new URLSearchParams\(\{\s*specialistId: clientFocusedModalPreviewSpecialistId/s,
    "Client-focused planner should load the selected modal specialist settings for local availability preview."
  );
  assert.match(
    source,
    /const shouldUseClientFocusedPreview = \([\s\S]*canUseClientFocusedAvailabilityPreview[\s\S]*clientFocusedModalPreviewSpecialistId === specialistId[\s\S]*appointmentsByDay: localConflictAppointmentsByDay/s,
    "Client-focused planner submit should switch local conflict checks to the selected modal specialist preview when available."
  );
  assert.match(
    source,
    /label htmlFor=\{isClientFocusedCreateMode \? "appointmentCreateClientReadonly" : "appointmentCreateClientSelect"\}[\s\S]*id="appointmentCreateClientReadonly"[\s\S]*readOnly[\s\S]*disabled/s,
    "Client-focused To Planner modal should keep the selected client locked in a readonly field."
  );
  assert.match(
    source,
    /const cardPrimaryText = isClientCardMode[\s\S]*item\?\.specialist[\s\S]*const cardSecondaryText = isClientCardMode/s,
    "Client mode planner cards should render specialist details so existing appointments can be edited from the grid."
  );
  assert.match(
    source,
    /isRoutineCard[\s\S]*String\(item\?\.secondaryText \|\| ""\)\.trim\(\)[\s\S]*String\(item\?\.specialistPosition \|\| ""\)\.trim\(\)[\s\S]*"Specialist"/s,
    "Client mode planner cards should prefer specialist position text instead of appointment service names."
  );
  assert.match(
    source,
    /const specialistPositionText = truncateWithEllipsis\([\s\S]*item\?\.specialistPosition[\s\S]*specialistRoleFallback[\s\S]*"Specialist"[\s\S]*secondaryText: specialistPositionText/s,
    "Client-focused planner rows should derive their secondary text from the specialist position fallback chain."
  );
  assert.match(
    source,
    /const COMPACT_APPOINTMENT_CARD_MAX_HEIGHT_PX = 24;/,
    "Appointment planner should define a compact-card height threshold for very small cells."
  );
  assert.match(
    source,
    /const appointmentCardHeightPx = effectiveRowSpan \* slotCellHeightPx;\s*const isCompactAppointmentCard = appointmentCardHeightPx <= COMPACT_APPOINTMENT_CARD_MAX_HEIGHT_PX;/s,
    "Appointment planner should derive compact card mode from rendered slot height."
  );
  assert.match(
    source,
    /appointment-booked-time-td appointment-booked-time-td-compact/,
    "Compact appointment cards should switch hover overlays to a single-line time label."
  );
  assert.match(
    source,
    /appointment-card-compact/,
    "Appointment planner should add the compact card class when the cell is too short."
  );
  assert.match(
    source,
    /!isCompactAppointmentCard \? <p className="appointment-service">\{cardSecondaryText\}<\/p> : null/,
    "Compact appointment cards should hide the secondary service line and keep only the primary label."
  );
  assert.match(
    source,
    /const isVipAutoRollingRepeat = Boolean\(vipOnly \|\| clientVipOnly\);/,
    "Planner modal should drive auto-rolling repeat from the Active toggle."
  );
  assert.match(
    source,
    /<label htmlFor="appointmentClientVipOnly">Active<\/label>[\s\S]*?className=\{`appointment-client-vip-toggle/,
    "Planner modal should rename the VIP toggle to Active."
  );
  assert.match(
    source,
    /const isVipAutoRollingRepeat = Boolean\(vipOnly \|\| clientVipOnly\);[\s\S]*const isVipAutoRollingRepeatToggleLocked = Boolean\(vipOnly \|\| \(isEditRecurring && clientVipOnly\)\);[\s\S]*id="appointmentClientVipOnly"[\s\S]*disabled=\{isVipAutoRollingRepeatToggleLocked \|\| createSubmitting \|\| createDeleting\}/s,
    "Planner modal should keep Active checked but locked only when reopening an auto-rolling recurring series."
  );
  assert.match(
    source,
    /if \(checked\) \{[\s\S]*repeatUntil: resolveAutoRollingRepeatUntilForSubmit\(prev\.appointmentDate\),[\s\S]*repeatDays: resolveAutoRollingRepeatDayKeys\([\s\S]*prev\.appointmentDate,[\s\S]*prev\.repeatDays,[\s\S]*visibleRepeatDayKeys/s,
    "Planner modal should auto-fill Repeat Until and the matching weekday when Active is turned on."
  );
  assert.match(
    source,
    /const defaultRepeatDays = DAY_KEYS_SET\.has\(day\.key\) \? \[day\.key\] : \[\];[\s\S]*repeatEnabled:\s*recurringOnly,[\s\S]*repeatDays:\s*defaultRepeatDays/s,
    "Planner create modal should preselect the clicked weekday in Repeat weekly without forcing repeat mode on."
  );
  assert.match(
    source,
    /function ensureAnchoredRepeatDayKeys\(appointmentDate = "", repeatDays = \[\], visibleDayKeys = \[\]\) \{[\s\S]*if \(currentRepeatDays\.length === 0\) \{[\s\S]*return currentRepeatDays;[\s\S]*if \(currentRepeatDays\.includes\(appointmentDayKey\)\) \{[\s\S]*return currentRepeatDays;[\s\S]*return normalizeRepeatDayKeys\(\[\.\.\.currentRepeatDays, appointmentDayKey\]\);/s,
    "Planner modal should keep the clicked appointment day inside any selected repeat pattern."
  );
  assert.doesNotMatch(
    source,
    /queryParams\.set\("isVip", "true"\)/,
    "Planner modal client search should no longer force VIP-only filtering."
  );
  assert.match(
    source,
    /requestPayload\.repeat = \{[\s\S]*autoRolling: isVipAutoRollingRepeat/s,
    "Planner modal should send autoRolling repeat metadata for active appointments."
  );
  assert.match(
    source,
    /<div className="field appointment-repeat-until-field">[\s\S]*appointmentCreateRepeatUntil/s,
    "Planner modal should keep the Repeat Until field visible even when Active auto-repeat is on."
  );
  assert.match(
    source,
    /const shouldValidateRepeat = !isEditMode \|\| allowRepeatValidationInEdit;[\s\S]*if \(requireRepeat && !wantsRepeat\) \{[\s\S]*errors\.repeatDays = "Select at least one repeat day\.";[\s\S]*if \(!isValidDateYmd\(repeatUntil\)\) \{[\s\S]*errors\.repeatUntil = "Invalid repeat end date\.";/s,
    "Planner modal should require Repeat Until before saving any repeated planner series."
  );
  assert.match(
    source,
    /repeatEnabled: Boolean\(createForm\.repeatEnabled\),[\s\S]*if \(isVipAutoRollingRepeat\) \{[\s\S]*nextPayload\.repeatEnabled = true;[\s\S]*\} else if \(!nextPayload\.repeatEnabled\) \{[\s\S]*nextPayload\.repeatDays = \[\];[\s\S]*\} else if \(nextPayload\.repeatDays\.length > 0\) \{[\s\S]*nextPayload\.repeatDays = ensureAnchoredRepeatDayKeys\([\s\S]*nextPayload\.appointmentDate,[\s\S]*nextPayload\.repeatDays,[\s\S]*visibleRepeatDayKeys/s,
    "Planner submit should treat the clicked weekday as a visual default until repeat mode is explicitly activated."
  );
  assert.match(
    source,
    /appointmentCreateRepeatUntil[\s\S]*setCreateForm\(\(prev\) => \(\{[\s\S]*repeatEnabled: isEditMode \? prev\.repeatEnabled : \(Boolean\(nextValue\) \|\| prev\.repeatEnabled\),[\s\S]*repeatUntil: nextValue/s,
    "Planner repeat-until input should activate repeat mode for new appointments."
  );
  assert.match(
    source,
    /function toggleRepeatDay\(dayKey\) \{[\s\S]*const appointmentDayKey = getDayKeyFromDateYmd\(createForm\.appointmentDate\);[\s\S]*if \(!isEditMode && normalizedDayKey === appointmentDayKey && currentDays\.length > 1\) \{[\s\S]*return prev;[\s\S]*\}[\s\S]*daySet\.delete\(normalizedDayKey\);[\s\S]*\} else \{[\s\S]*daySet\.add\(normalizedDayKey\);[\s\S]*if \(!isEditMode && appointmentDayKey && normalizedDayKey !== appointmentDayKey\) \{[\s\S]*daySet\.add\(appointmentDayKey\);[\s\S]*repeatEnabled: isEditMode \? prev\.repeatEnabled : daySet\.size > 0,/s,
    "Planner repeat day picker should activate repeat mode only after the user changes the weekday selection."
  );
  assert.match(
    source,
    /id="appointmentCreateTime"[\s\S]*menuHeightScale=\{0\.85\}/s,
    "Planner Start Time dropdown should keep its default width and only shrink the opened menu height."
  );
  assert.match(
    source,
    /blockedTimes:\s*normalizePlannerBlockedTimeItems\(normalizedItem\.blockedTimes\)/,
    "Appointment settings should carry specialist blocked times into planner state."
  );
  assert.match(
    source,
    /appointmentWorkScheduleBlockedSlotsByDay/,
    "Planner should convert specialist blocked times into blocked slot cells."
  );
  assert.match(
    source,
    /appointment-work-schedule-blocked-td/,
    "Planner should render blocked work schedule cells with a dedicated class."
  );
});

test("Appointment scheduler recurring edit restores and submits series repeat settings", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /repeatUntilDate:\s*String\(item\?\.repeatUntilDate \|\| ""\)\.trim\(\),[\s\S]*repeatDays,[\s\S]*repeatAnchorDate:\s*String\(item\?\.repeatAnchorDate \|\| ""\)\.trim\(\),[\s\S]*isRepeatRoot:\s*Boolean\(item\?\.isRepeatRoot\)/s,
    "Planner cards should keep recurring metadata so edit modal can restore the current series pattern."
  );
  assert.match(
    source,
    /const inferCurrentSeriesRepeatDayKeys = useCallback\(\(existingItem, fallbackDays = \[\]\) => \{[\s\S]*const existingRepeatDays = inferCurrentSeriesRepeatDayKeys\([\s\S]*existingItem\?\.repeatDays[\s\S]*const defaultEditDayKeys = existingRepeatDays\.length > 0[\s\S]*DAY_KEYS_SET\.has\(day\.key\) \? \[day\.key\] : \[\][\s\S]*repeatEnabled:\s*isExistingRecurring,[\s\S]*repeatUntil:\s*isExistingRecurring[\s\S]*existingItem\?\.repeatUntilDate[\s\S]*repeatDays:\s*defaultEditDayKeys/s,
    "Editing appointments should restore recurring weekdays and still show the clicked weekday for non-recurring items."
  );
  assert.match(
    source,
    /const canEditRecurringSeriesPattern = !isEditRecurring \|\| normalizedEditScope !== "single";/,
    "Recurring edit modal should know when the user is editing the whole series instead of a single item."
  );
  assert.match(
    source,
    /const displayedRepeatDayKeys = useMemo\(\(\) => \{[\s\S]*if \(!isEditRecurring \|\| normalizedEditScope !== "single"\) \{[\s\S]*return normalizedFormRepeatDays;[\s\S]*if \(normalizedFormRepeatDays\.length > 0\) \{[\s\S]*return normalizedFormRepeatDays;[\s\S]*return DAY_KEYS_SET\.has\(sourceRecurringEditDayKey\) \? \[sourceRecurringEditDayKey\] : normalizedFormRepeatDays;[\s\S]*const selectedSingleRecurringEditDayKey = useMemo/s,
    "Recurring single-scope edits should show the full stored series pattern while still tracking a single target weekday."
  );
  assert.match(
    source,
    /const showRecurringEditNextToggle = createModal\.mode === "edit" && isEditRecurring;[\s\S]*appointment-create-date-time-row-with-next-toggle[\s\S]*id="appointmentEditScopeFuture"/s,
    "Recurring edit modal should render the Next scope checkbox inline with the date and time row."
  );
  assert.match(
    source,
    /const sourceRecurringEditDayKey = String\(createModal\.dayKey \|\| ""\)\.trim\(\)\.toLowerCase\(\);[\s\S]*const originalRecurringEditRepeatDays = normalizeRepeatDayKeys\(createModal\.originalRepeatDays\);[\s\S]*const allowedSingleRecurringEditDayKeys = isEditRecurring && normalizedEditScope === "single"[\s\S]*const selectedSingleRecurringEditDayKey = useMemo[\s\S]*stillMatchesOriginal[\s\S]*originalRecurringEditRepeatDays\.length > 1[\s\S]*return \[sourceRecurringEditDayKey\];/s,
    "Recurring edits should keep original weekdays available in single scope while still seeding Next from the clicked weekday."
  );
  assert.match(
    source,
    /appointmentCreateRepeatUntil[\s\S]*disabled=\{!canEditRecurringSeriesPattern \|\| createSubmitting \|\| createDeleting\}[\s\S]*const isDisabledForSingleRecurringEdit = \([\s\S]*allowedSingleRecurringEditDayKeys\.includes\(day\.key\)[\s\S]*normalizedEditScope !== "single"/s,
    "Recurring edit modal should keep Repeat Until locked in single scope while allowing target selection only from the original series weekdays."
  );
  assert.match(
    source,
    /if \(isVipAutoRollingRepeat\) \{[\s\S]*nextPayload\.repeatUntil = String\(nextPayload\.repeatUntil \|\| ""\)\.trim\(\)[\s\S]*resolveAutoRollingRepeatUntilForSubmit\(nextPayload\.appointmentDate\)[\s\S]*nextPayload\.repeatDays = resolveAutoRollingRepeatDayKeys\([\s\S]*nextPayload\.appointmentDate,[\s\S]*nextPayload\.repeatDays,[\s\S]*visibleRepeatDayKeys[\s\S]*const allowRepeatValidationInEdit = isEditMode && \(!isEditRecurring \|\| nextPayload\.editScope !== "single"\);[\s\S]*requireRepeat:\s*\(\s*\(!isEditMode && \(recurringOnly \|\| isVipAutoRollingRepeat\)\)\s*\|\|\s*\(isEditRecurring && nextPayload\.editScope !== "single"\)\s*\)/s,
    "Planner validation should auto-seed Active repeat fields while still requiring Repeat weekly for future-scope recurring edits and creates."
  );
  assert.match(
    source,
    /const shouldSendRepeat = recurringOnly[\s\S]*nextPayload\.editScope !== "single"/s,
    "Series edit submit should send repeat payload when future scope is selected."
  );
  assert.match(
    source,
    /const deleteScope = normalizeEditScopeValue\(createForm\.editScope\);[\s\S]*if \(isEditRecurring && \(deleteScope === "future" \|\| deleteScope === "single"\)\) \{[\s\S]*const deleteDayKeys = deleteScope === "single"[\s\S]*normalizeRepeatDayKeys\(\[selectedSingleRecurringEditDayKey\]\)[\s\S]*normalizeRepeatDayKeys\(createForm\.repeatDays\)[\s\S]*queryParams\.set\("dayKeys", deleteDayKeys\.join\(","\)\);/s,
    "Recurring deletes should forward explicit weekday targets for Next scope."
  );
  assert.match(
    source,
    /if \(isEditRecurring && \(deleteScope === "future" \|\| deleteScope === "single"\)\) \{[\s\S]*deleteScope === "single"[\s\S]*normalizeRepeatDayKeys\(\[selectedSingleRecurringEditDayKey\]\)/s,
    "Recurring single-scope deletes should target the selected weekday within the current series week."
  );
  assert.match(
    source,
    /if \(isEditMode\) \{[\s\S]*const queryParams = new URLSearchParams\(\{[\s\S]*scope: String\(nextPayload\.editScope \|\| "single"\)[\s\S]*if \(isEditRecurring && nextPayload\.editScope === "single"\) \{[\s\S]*const singleDayKeys = normalizeRepeatDayKeys\(\[selectedSingleRecurringEditDayKey\]\);[\s\S]*queryParams\.set\("dayKeys", singleDayKeys\.join\(","\)\);/s,
    "Recurring single-scope saves should target the selected weekday within the current series week."
  );
});
