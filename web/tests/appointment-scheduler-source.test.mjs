import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Appointment scheduler supports client-focused multi-specialist planner view", async () => {
  const [source, css, translations] = await Promise.all([
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8"),
    readFile(new URL("../src/i18n/translations.js", import.meta.url), "utf8")
  ]);

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
    /function getPlannerDayDisplayLabels\(day, translate = null\)[\s\S]*label: translateText\(label\),[\s\S]*shortLabel: translateText\(shortLabel\)/s,
    "Appointment planner should translate full and short weekday labels before rendering them."
  );
  assert.match(
    source,
    /function AppointmentPlannerGrid\([\s\S]*const \{ translate \} = useI18n\(\);[\s\S]*buildPlannerWeekDays\(weekStartDate, settings\?\.visibleWeekDays, translate\)/s,
    "Appointment planner grid should rebuild weekday headers when the active language changes."
  );
  assert.match(
    source,
    /const visibleRepeatDayItems = useMemo\([\s\S]*getPlannerDayDisplayLabels\(day, translate\)[\s\S]*<span>\{day\.shortLabel\}<\/span>/s,
    "Appointment repeat weekday chips should use translated short labels instead of slicing English names."
  );
  assert.match(
    translations,
    /Monday", uz: "Dushanba", ru: "Понедельник"[\s\S]*Tuesday", uz: "Seshanba", ru: "Вторник"[\s\S]*Sunday", uz: "Yakshanba", ru: "Воскресенье"/s,
    "Appointment planner should have full weekday translations for Uzbek and Russian."
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
    /onOpenDayBulkModal=\{openDayBulkModal\}/,
    "Specialist planner should expose day-header bulk appointment actions."
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
    /onChange=\{\(nextValue\) => \{[\s\S]*const nextSpecialistId = String\(nextValue \|\| ""\)\.trim\(\);[\s\S]*setWeekOffset\(0\);[\s\S]*setPlannerPrimaryFilterMode\("specialist"\);[\s\S]*setSelectedSpecialistId\(nextSpecialistId\);/s,
    "Selecting a specialist first should reset to the current week and make specialist mode primary without clearing the client filter."
  );
  assert.match(
    source,
    /onChange=\{\(nextValue\) => \{[\s\S]*const nextClientId = String\(nextValue \|\| ""\)\.trim\(\);[\s\S]*setWeekOffset\(0\);[\s\S]*setPlannerPrimaryFilterMode\("client"\);[\s\S]*setSelectedPlannerClientFilterId\(nextClientId\);/s,
    "Selecting a client first should reset to the current week and make client mode primary without clearing the specialist filter."
  );
  assert.match(
    source,
    /hasPlannerComparisonOverlay[\s\S]*comparisonOverlayAppointmentsByDay[\s\S]*overlayAppointmentsByDay=\{comparisonOverlayAppointmentsByDay\}/s,
    "Planner should keep both specialist and client selections and pass the second selection as a comparison overlay."
  );
  assert.match(
    source,
    /showBusyOverlay=\{!hasPlannerComparisonOverlay\}[\s\S]*highlightAvailableCommonSlots=\{hasPlannerComparisonOverlay\}/s,
    "When both specialist and client are selected, comparison busy slots should stay blocking-only and common free slots should be highlighted."
  );
  assert.match(
    source,
    /const isCommonFreeSlot = Boolean\(highlightAvailableCommonSlots && canOpenCreateFromCell\);[\s\S]*appointment-common-free-slot-td/s,
    "Planner should only mark a common free slot green when the cell is actually open for creating an appointment."
  );
  assert.match(
    css,
    /appointment-common-free-slot-td[\s\S]*background: #d2e5fc;/,
    "Common free appointment slots should use a soft neutral background."
  );
  assert.match(
    source,
    /clearPlannerSpecialistSelection[\s\S]*setSelectedSpecialistId\(""\)[\s\S]*clearPlannerClientSelection[\s\S]*setSelectedPlannerClientFilterId\(""\)/s,
    "Planner toolbar clear buttons should clear specialist and client filter state."
  );
  assert.match(
    source,
    /if \(vipOnly\) \{[\s\S]*return nextSpecialists\[0\]\?\.id \|\| "";[\s\S]*return "";/s,
    "Non-VIP planner should not auto-select a fallback specialist after filters were cleared or only a client was restored."
  );
  assert.match(
    source,
    /className="appointment-toolbar-clear-btn"[\s\S]*onClick=\{clearPlannerSpecialistSelection\}[\s\S]*className="appointment-toolbar-clear-btn"[\s\S]*onClick=\{clearPlannerClientSelection\}/s,
    "Specialist and client planner selects should render explicit clear buttons."
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
    /id="appointmentCreateClientReadonly"[\s\S]*aria-label="Client"[\s\S]*readOnly[\s\S]*disabled/s,
    "Client-focused To Planner modal should keep the selected client locked in a readonly field."
  );
  assert.match(
    source,
    /const cardPrimaryText = isClientCardMode[\s\S]*item\?\.specialist[\s\S]*const cardSecondaryText = isClientCardMode/s,
    "Client mode planner cards should render specialist details so existing appointments can be edited from the grid."
  );
  assert.match(
    source,
    /isRoutineCard[\s\S]*String\(item\?\.service \|\| item\?\.serviceName \|\| ""\)\.trim\(\) \|\| "Service"/s,
    "Client mode planner cards should show appointment service names under the specialist name."
  );
  assert.match(
    source,
    /const specialistPositionText = truncateWithEllipsis\([\s\S]*item\?\.specialistPosition[\s\S]*specialistRoleFallback[\s\S]*"Specialist"[\s\S]*secondaryText: specialistPositionText/s,
    "VIP weekly client rows should keep the specialist position fallback chain for their secondary text."
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
    /const isSingleEntryMode = !createForm\.repeatEnabled;/,
    "Planner modal should derive one-time mode from repeatEnabled."
  );
  assert.match(
    source,
    /function handleSingleEntryModeToggle\(nextSingleEntryMode\) \{[\s\S]*repeatEnabled: false[\s\S]*repeatEnabled: true,[\s\S]*repeatUntil: restoredRepeatUntil,[\s\S]*repeatDays: restoredRepeatDays/s,
    "Planner modal should preserve and restore repeat details when toggling one-time mode."
  );
  assert.match(
    source,
    /const isSeriesOneMode = isEditRecurring \? normalizedEditScope === "single" : isSingleEntryMode;[\s\S]*<label htmlFor="appointmentCreateSeriesOneMode">Series<\/label>[\s\S]*id="appointmentCreateSeriesOneMode"[\s\S]*checked=\{isSeriesOneMode\}[\s\S]*<span>One<\/span>/s,
    "Planner modal should expose one-time create mode as the shared Series One toggle."
  );
  assert.match(
    source,
    /const shouldDefaultToRecurring = recurringOnly \|\| !vipOnly;[\s\S]*const defaultRepeatDays = DAY_KEYS_SET\.has\(day\.key\) \? \[day\.key\] : \[\];[\s\S]*repeatEnabled:\s*shouldDefaultToRecurring,[\s\S]*repeatDays:\s*defaultRepeatDays/s,
    "Planner create modal should preselect the clicked weekday and default standard planner appointments to repeat mode."
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
    /requestPayload\.repeat = \{[\s\S]*autoRolling: true/s,
    "Planner modal should send autoRolling repeat metadata for repeated appointments."
  );
  assert.match(
    source,
    /const shouldValidateRepeat = !isEditMode \|\| allowRepeatValidationInEdit;[\s\S]*if \(requireRepeat && !wantsRepeat\) \{[\s\S]*errors\.repeatDays = "Select at least one repeat day\.";[\s\S]*if \(!isValidDateYmd\(repeatUntil\)\) \{[\s\S]*errors\.repeatUntil = "Invalid repeat end date\.";/s,
    "Planner modal should require Repeat Until before saving any repeated planner series."
  );
  assert.match(
    source,
    /service: "",[\s\S]*servicePriceUzs: "0"/s,
    "Planner create form should start without a default service so the user must choose one."
  );
  assert.match(
    source,
    /if \(!service\) \{[\s\S]*errors\.service = "Service is required\.";[\s\S]*if \(status === "confirmed"/s,
    "Planner modal should require a selected service before saving an appointment."
  );
  assert.doesNotMatch(
    source,
    /service: nextPayload\.service \|\| DEFAULT_APPOINTMENT_SERVICE_NAME/,
    "Planner submit should not silently fall back to a default service name."
  );
  assert.match(
    source,
    /repeatEnabled: Boolean\(createForm\.repeatEnabled\),[\s\S]*if \(!nextPayload\.repeatEnabled\) \{[\s\S]*nextPayload\.repeatDays = \[\];[\s\S]*\} else if \(nextPayload\.repeatDays\.length > 0\) \{[\s\S]*nextPayload\.repeatDays = ensureAnchoredRepeatDayKeys\([\s\S]*nextPayload\.appointmentDate,[\s\S]*nextPayload\.repeatDays,[\s\S]*visibleRepeatDayKeys/s,
    "Planner submit should treat the clicked weekday as a visual default until repeat mode is explicitly activated."
  );
  assert.match(
    source,
    /function toggleRepeatDay\(dayKey\) \{[\s\S]*const appointmentDayKey = getDayKeyFromDateYmd\(createForm\.appointmentDate\);[\s\S]*if \(!isEditMode && normalizedDayKey === appointmentDayKey && currentDays\.length > 1\) \{[\s\S]*return prev;[\s\S]*\}[\s\S]*daySet\.delete\(normalizedDayKey\);[\s\S]*\} else \{[\s\S]*daySet\.add\(normalizedDayKey\);[\s\S]*if \(!isEditMode && appointmentDayKey && normalizedDayKey !== appointmentDayKey\) \{[\s\S]*daySet\.add\(appointmentDayKey\);[\s\S]*repeatEnabled: prev\.repeatEnabled,/s,
    "Planner repeat day picker should update weekdays without changing one-time/repeat mode."
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
  assert.match(
    source,
    /canOpenEditableBlockFromCell[\s\S]*onOpenPlannerBlockModal\(day, slot, editableBlockType, editableBlockItem\)/s,
    "Planner blocked break and work-schedule cells should be clickable so they can be edited from the slot."
  );
  assert.match(
    source,
    /appointment-editable-block-slot-td/,
    "Editable planner blocks should get a dedicated cursor/hover class instead of behaving like inert blocked slots."
  );
  assert.match(
    source,
    /plannerBlockOriginal[\s\S]*currentItemsExcludingOriginal[\s\S]*currentItemsExcludingTargets[\s\S]*\.\.\.currentItemsExcludingTargets/s,
    "Break edits should replace the original break entry and upsert the selected repeat weekdays instead of appending duplicates."
  );
  assert.match(
    source,
    /plannerBlockRepeatDayNumbers[\s\S]*plannerBlockRepeatDaySet[\s\S]*Break repeat weekdays[\s\S]*Work schedule repeat weekdays/s,
    "Break and work-schedule planner blocks should expose repeat weekday chips for multi-day save/delete."
  );
  assert.match(
    source,
    /const targetDayKey = String\(originalBreak\?\.dayKey \|\| createModal\.dayKey \|\| ""\)[\s\S]*targetStartTime[\s\S]*targetEndTime/s,
    "Break deletion should target the originally clicked block even if form fields were changed before pressing delete."
  );
  assert.match(
    source,
    /isPlannerBlockEditMode[\s\S]*To Planner", disabled: true[\s\S]*normalizedPlannerBlockType !== PLANNER_MODAL_TABS\.break[\s\S]*normalizedPlannerBlockType !== PLANNER_MODAL_TABS\.workSchedule/s,
    "Editing an occupied break/work-schedule slot should keep the other modal tabs visibly blocked."
  );
  assert.match(
    source,
    /if \(isPlannerBlockEditMode && normalizedValue !== normalizedPlannerBlockType\) \{[\s\S]*return;[\s\S]*\}/s,
    "Blocked-slot edit mode should prevent switching to another planner tab."
  );
  assert.match(
    source,
    /disabled=\{createSubmitting \|\| createDeleting \|\| Boolean\(tab\.disabled\)\}/,
    "Planner modal tabs should honor per-tab disabled state."
  );
  assert.match(
    source,
    /const refreshPlannerServerState = useCallback\(async \(\) => \{[\s\S]*loadAppointmentSettings\(\{ silent: true \}\)[\s\S]*loadSchedulesForCurrentWeek\(\)[\s\S]*loadBreaksForSelectedSpecialist\(\)[\s\S]*loadAbsencesForSelectedSpecialist\(\)[\s\S]*loadClientFocusedPlannerView\(\)/s,
    "Planner mutations should force fresh server reads for settings, schedules, breaks, absences, and client-focused data."
  );
  assert.equal(
    (source.match(/await refreshPlannerServerState\(\);/g) || []).length,
    9,
    "Planner appointment, drag-move, day-bulk, break, and work-schedule save/delete flows should await a server refresh after mutation."
  );
  assert.match(
    source,
    /className="appointment-day-bulk-btn"[\s\S]*Day Planner[\s\S]*function openDayBulkModal\(day, items = \[\]\)[\s\S]*appointment-day-bulk-modal[\s\S]*appointment-day-bulk-check-all[\s\S]*Saving\.\.\.[\s\S]*Save[\s\S]*Deleting\.\.\.[\s\S]*Delete/s,
    "Day bulk modal should open from the full day header and list appointments with all/select controls and edit/delete actions."
  );
  assert.match(
    source,
    /async function handleDayBulkEditSubmit\(event\)[\s\S]*for \(const item of selectedItems\)[\s\S]*method: "PATCH"[\s\S]*status: nextStatus[\s\S]*await refreshPlannerServerState\(\);/s,
    "Day bulk edit should PATCH each selected appointment and refresh server state."
  );
  assert.match(
    source,
    /async function handleDayBulkDelete\(\)[\s\S]*for \(const item of selectedItems\)[\s\S]*method: "DELETE"[\s\S]*await refreshPlannerServerState\(\);/s,
    "Day bulk delete should DELETE each selected appointment and refresh server state."
  );
  assert.match(
    source,
    /onMouseDown=\{\(event\) => \{[\s\S]*event\.button !== 0[\s\S]*event\.preventDefault\(\);[\s\S]*mouseDragStateRef\.current = \{[\s\S]*item,[\s\S]*sourceDay:/s,
    "Editable planner appointment cards should start custom drag movement from the left mouse button."
  );
  assert.match(
    source,
    /const canDropAppointmentToCell = \([\s\S]*isInsideWorkingHours[\s\S]*!item[\s\S]*canUpdateAppointments[\s\S]*canMutatePlannerSpecialist[\s\S]*typeof onMoveAppointment === "function"[\s\S]*onDrop=\{canDropAppointmentToCell \? \(event\) => \{[\s\S]*getData\("application\/json"\)[\s\S]*getData\("text\/plain"\)[\s\S]*JSON\.parse\(rawPayload\)[\s\S]*onMoveAppointment\(payload\.item, payload\.sourceDay, day, slot\)/s,
    "Empty planner slots should accept dropped appointments and pass the target day/time to the move handler."
  );
  assert.match(
    source,
    /function findDropCellFromPoint\(clientX, clientY, selector\)[\s\S]*document\.elementFromPoint\(clientX, clientY\)[\s\S]*document\.elementsFromPoint[\s\S]*document\.querySelectorAll\(selector\)[\s\S]*clientX >= rect\.left[\s\S]*clientY <= rect\.bottom/s,
    "Planner drag target lookup should fall back to drop-cell geometry when elementFromPoint misses."
  );
  assert.doesNotMatch(
    source,
    /onMovePlannerBreak|movePlannerBreakToSlot|appointment-break-draggable|data-planner-break-target-slot|data-break-drop-slot/,
    "Break and work-schedule blocks should remain editable but not draggable/movable from the planner grid."
  );
  assert.match(
    source,
    /async function moveAppointmentToSlot\(item, sourceDay, targetDay, targetSlot\)[\s\S]*getPlannerWorkingHoursConflictMessage[\s\S]*findPlannerBlockedTimeConflict[\s\S]*findPlannerBreakConflict[\s\S]*findPlannerAbsenceConflict[\s\S]*findLocalScheduleConflict[\s\S]*method: "PATCH"[\s\S]*await refreshPlannerServerState\(\);/s,
    "Moving an appointment should validate conflicts, PATCH the schedule, and reload planner data from the server."
  );
  assert.match(
    source,
    /function isPendingAppointmentStatus\(value\)[\s\S]*=== "pending";[\s\S]*className=\{`appointment-card[\s\S]*\$\{isPendingAppointment && !isHistoryLockedDayCell \? " appointment-card-btn" : ""\}[\s\S]*if \(event\.button !== 0 \|\| !isPendingAppointment \|\| isHistoryLockedDayCell \|\| typeof onMoveAppointment !== "function"\)[\s\S]*Only pending appointments can be moved/s,
    "Planner should limit drag movement to pending appointments while still allowing non-pending appointments to be opened."
  );
  assert.match(
    source,
    /function getHistoryLockCutoffDateYmd\(historyLockDays\)[\s\S]*return "";[\s\S]*function isHistoryLockedDateYmd\(value, historyLockDays\)[\s\S]*value[\s\S]*< cutoffDate[\s\S]*!isHistoryLockedDayCell[\s\S]*Appointments cannot be moved outside the history lock window/s,
    "Planner drag movement should use the configured history lock window."
  );
  assert.match(
    source,
    /const targetWeekStart = formatDateYmd\(getStartOfWeek\(new Date\(`\$\{targetAppointmentDate\}T00:00:00`\)\)\);[\s\S]*const visibleWeekStart = formatDateYmd\(weekStartDate\);[\s\S]*Appointments can only be moved within the visible week/s,
    "Drag move should stay within the currently visible planner week."
  );
  assert.match(
    source,
    /function findDropCellFromPoint\(clientX, clientY, selector\)[\s\S]*document\.elementFromPoint\(clientX, clientY\)[\s\S]*document\.elementsFromPoint\(clientX, clientY\)[\s\S]*const dropSelector = "\[data-appointment-drop-slot='true'\]"[\s\S]*findDropCellFromPoint\(event\.clientX, event\.clientY, dropSelector\)[\s\S]*onMoveAppointment\([\s\S]*dragState\.item,[\s\S]*dragState\.sourceDay,[\s\S]*targetSlot/s,
    "Planner drag move should include a mouse fallback that resolves the drop slot under the cursor."
  );
  assert.doesNotMatch(
    source,
    /appointment-drag-preview/,
    "Planner drag move should not render a cloned appointment card while dragging."
  );
  assert.match(
    source,
    /const targetSlot = String\(dropCell\?\.getAttribute\("data-drop-slot"\)[\s\S]*targetSlot,[\s\S]*targetHeight: dropCellRect \? Math\.max\(dropCellRect\.height, dragState\.height\) : 0[\s\S]*className=\{`appointment-drop-orienter \$\{mouseDragPreview\.statusCellClassName[\s\S]*appointment-drop-orienter-time[\s\S]*mouseDragPreview\.targetSlot/s,
    "Planner drag move should show a target-sized orienter with the hovered slot time."
  );
  assert.match(
    source,
    /function isFutureDateYmd\(value\)[\s\S]*targetDate > today;[\s\S]*status === "confirmed" && isFutureDateYmd\(appointmentDate\)[\s\S]*errors\.status = "Future appointments cannot be confirmed\.";[\s\S]*<small className="field-error">\{createErrors\.status \|\| ""\}<\/small>/s,
    "Planner should prevent future appointments from being marked confirmed in the modal."
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
    /shouldShowRecurringEditNextToggle \? \([\s\S]*<label htmlFor="appointmentEditScopeOne">Series<\/label>[\s\S]*id="appointmentEditScopeOne"[\s\S]*checked=\{isSeriesOneMode\}[\s\S]*editScope: oneChecked \? "single" : "future"[\s\S]*<span>One<\/span>[\s\S]*\) : \([\s\S]*<label htmlFor="appointmentCreateSeriesOneMode">Series<\/label>/s,
    "Standard recurring edit modal should reuse the Series One toggle and invert it to single-item scope."
  );
  assert.match(
    source,
    /editScope: isExistingRecurring \? "future" : "single"/,
    "Recurring edits should default to series scope."
  );
  assert.match(
    source,
    /const sourceRecurringEditDayKey = String\(createModal\.dayKey \|\| ""\)\.trim\(\)\.toLowerCase\(\);[\s\S]*const originalRecurringEditRepeatDays = normalizeRepeatDayKeys\(createModal\.originalRepeatDays\);[\s\S]*const allowedSingleRecurringEditDayKeys = isEditRecurring && normalizedEditScope === "single"/s,
    "Recurring edits should still support a single target weekday when One is checked."
  );
  assert.match(
    source,
    /const allowedSingleRecurringEditDayKeys = isEditRecurring && normalizedEditScope === "single"[\s\S]*const isDisabledForSingleRecurringEdit = \([\s\S]*allowedSingleRecurringEditDayKeys\.length > 0[\s\S]*!allowedSingleRecurringEditDayKeys\.includes\(day\.key\)[\s\S]*normalizedEditScope !== "single"[\s\S]*: isDisabledForSingleRecurringEdit/s,
    "Recurring single-scope edits should allow target selection only from the original series weekdays."
  );
  assert.match(
    source,
    /const allowRepeatValidationInEdit = isEditMode && \(!isEditRecurring \|\| nextPayload\.editScope !== "single"\);[\s\S]*requireRepeat:\s*\([\s\S]*nextPayload\.repeatEnabled[\s\S]*&& \(!isEditMode \|\| !isEditRecurring \|\| nextPayload\.editScope !== "single"\)[\s\S]*\)/s,
    "Planner validation should require repeat details whenever a repeat series is being saved."
  );
  assert.match(
    source,
    /const shouldSendRepeat = \([\s\S]*nextPayload\.repeatEnabled[\s\S]*nextPayload\.repeatDays\.length > 0[\s\S]*nextPayload\.editScope !== "single"/s,
    "Series edit submit should send repeat payload when future scope is selected."
  );
  assert.match(
    source,
    /const deleteScope = isSpecialistLimitedEditMode \? "single" : normalizeEditScopeValue\(createForm\.editScope\);[\s\S]*if \(isEditRecurring && \(deleteScope === "future" \|\| deleteScope === "single"\)\) \{[\s\S]*const deleteDayKeys = deleteScope === "single"[\s\S]*normalizeRepeatDayKeys\(\[selectedSingleRecurringEditDayKey\]\)[\s\S]*normalizeRepeatDayKeys\(createForm\.repeatDays\)[\s\S]*queryParams\.set\("dayKeys", deleteDayKeys\.join\(","\)\);/s,
    "Recurring deletes should forward explicit weekday targets for all-series scope."
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
