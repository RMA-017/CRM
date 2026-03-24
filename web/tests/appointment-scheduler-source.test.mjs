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
    /onChange=\{\(nextValue\) => \{[\s\S]*const nextSpecialistId = String\(nextValue \|\| ""\)\.trim\(\);[\s\S]*setSelectedSpecialistId\(nextSpecialistId\);[\s\S]*if \(nextSpecialistId\) \{[\s\S]*setSelectedPlannerClientFilterId\(""\);[\s\S]*\}/s,
    "Selecting a specialist in the toolbar should clear the client filter."
  );
  assert.match(
    source,
    /onChange=\{\(nextValue\) => \{[\s\S]*const nextClientId = String\(nextValue \|\| ""\)\.trim\(\);[\s\S]*setSelectedPlannerClientFilterId\(nextClientId\);[\s\S]*if \(nextClientId\) \{[\s\S]*setSelectedSpecialistId\(""\);[\s\S]*\}/s,
    "Selecting a client in the toolbar should clear the specialist filter."
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
    /if \(checked\) \{[\s\S]*const nextRepeatUntil = getVipAutoRollingRepeatUntil\(prev\.appointmentDate\);[\s\S]*repeatUntil: nextRepeatUntil/s,
    "Planner modal should auto-fill Repeat Until from the selected appointment date when Active is turned on."
  );
  assert.match(
    source,
    /const nextMinimumRepeatUntil = isVipAutoRollingRepeat\s*\?\s*getVipAutoRollingRepeatUntil\(nextValue\)\s*:\s*nextValue;/s,
    "Planner modal should keep Repeat Until in sync with later appointment dates while Active is enabled."
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
    /const existingRepeatDays = Array\.isArray\(existingItem\?\.repeatDays\)[\s\S]*repeatEnabled:\s*isExistingRecurring,[\s\S]*repeatUntil:\s*isExistingRecurring[\s\S]*existingItem\?\.repeatUntilDate[\s\S]*repeatDays:\s*isExistingRecurring \? existingRepeatDays : \[\]/s,
    "Editing an existing recurring appointment should prefill repeat controls from the current series."
  );
  assert.match(
    source,
    /const canEditRecurringSeriesPattern = !isEditRecurring \|\| normalizedEditScope !== "single";/,
    "Recurring edit modal should know when the user is editing the whole series instead of a single item."
  );
  assert.match(
    source,
    /!\s*isVipRecurringModal[\s\S]*appointmentCreateRepeatUntil[\s\S]*disabled=\{!canEditRecurringSeriesPattern \|\| createSubmitting \|\| createDeleting\}/s,
    "Recurring edit modal should keep repeat controls visible while single-scope edits stay read-only."
  );
  assert.match(
    source,
    /const allowRepeatValidationInEdit = isEditMode && \(!isEditRecurring \|\| nextPayload\.editScope !== "single"\);[\s\S]*requireRepeat:\s*\(recurringOnly && !isEditMode\) \|\| \(isEditRecurring && nextPayload\.editScope !== "single"\)/s,
    "Series edit validation should require repeat fields for future and all-scope updates."
  );
  assert.match(
    source,
    /const shouldSendRepeat = recurringOnly[\s\S]*nextPayload\.editScope !== "single"/s,
    "Series edit submit should send repeat payload when future or all-in-series scope is selected."
  );
});
