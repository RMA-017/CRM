import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("specialist absences menu and planner source wiring stay in place", async () => {
  const [sideMenuSource, appSource, schedulerSource, helpersSource, accessSource, panelSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/profile.helpers.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useProfileAccess.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/AppointmentSpecialistAbsencesPanel.jsx", import.meta.url), "utf8")
  ]);

  assert.match(
    sideMenuSource,
    /id="openAppointmentSpecialistAbsencesBtn"[\s\S]*Specialist Absences/,
    "Profile side menu should expose the Specialist Absences submenu entry."
  );

  assert.match(
    appSource,
    /path="\/appointments\/specialist-absences"[\s\S]*forcedView="appointment-specialist-absences"/,
    "App routes should wire the specialist absences panel URL."
  );

  assert.match(
    schedulerSource,
    /apiFetch\(`\/api\/appointments\/absences\?\$\{new URLSearchParams\(/,
    "Appointment scheduler should fetch specialist absences for the visible week."
  );

  assert.match(
    schedulerSource,
    /absencesForSpecialist=\{absencesForSpecialist\}/,
    "Appointment planner grid should receive absence items for rendering."
  );

  assert.match(
    helpersSource,
    /"appointment-specialist-absences": \["appointments\.specialist_absences"\]/,
    "Forced specialist absences view should be gated by the dedicated org feature."
  );

  assert.match(
    accessSource,
    /PERMISSIONS\.APPOINTMENTS_SPECIALIST_ABSENCES_READ[\s\S]*canOpenAppointmentSpecialistAbsences/,
    "Profile access hook should use dedicated specialist absence permissions."
  );

  assert.match(
    panelSource,
    /id="openAppointmentSpecialistAbsenceCreateBtn"[\s\S]*appointment-breaks-add-icon-btn[\s\S]*\+/,
    "Specialist absences panel should expose a header add button next to close."
  );

  assert.match(
    panelSource,
    /const \[createFormOpen, setCreateFormOpen\] = useState\(false\);[\s\S]*const createModal = createFormOpen \?/s,
    "Specialist absences panel should only build the create modal when add is requested."
  );

  assert.match(
    panelSource,
    /setForm\(createEmptyForm\(todayYmd,\s*specialistOptions\[0\]\?\.value \|\| form\.specialistId \|\| ""\)\);[\s\S]*setCreateFormOpen\(true\);/s,
    "Specialist absences add flow should reset the form before opening a new create entry."
  );

  assert.match(
    panelSource,
    /createPortal\(createModal,\s*document\.body\)/,
    "Specialist absences add flow should render through a body portal."
  );

  assert.match(
    panelSource,
    /className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal appointment-specialist-absence-modal"[\s\S]*className="login-overlay"/s,
    "Specialist absences add flow should keep the modal paired with an overlay."
  );

  assert.match(
    panelSource,
    /apiFetch\("\/api\/appointments\/specialists"[\s\S]*appointmentSpecialistAbsenceSpecialistSelect[\s\S]*appointmentSpecialistAbsenceDateFromInput[\s\S]*appointmentSpecialistAbsenceDateToInput[\s\S]*appointmentSpecialistAbsenceStartTimeInput[\s\S]*appointmentSpecialistAbsenceEndTimeInput/s,
    "Specialist absences create modal should load DB specialists into a select and include date plus time from\/to inputs."
  );

  assert.match(
    panelSource,
    /function buildAbsenceRangeGroups\(items\) \{[\s\S]*itemIds[\s\S]*dateFrom[\s\S]*dateTo[\s\S]*startTime[\s\S]*endTime/s,
    "Specialist absences panel should group saved day rows back into visible date and time ranges."
  );

  assert.match(
    panelSource,
    /<th>Specialist<\/th>[\s\S]*<th>Date From<\/th>[\s\S]*<th>Date To<\/th>[\s\S]*<th>Time<\/th>[\s\S]*<th>Reason<\/th>[\s\S]*<th>Edit<\/th>[\s\S]*<th>Delete<\/th>/s,
    "Specialist absences table should show the specialist, date range, time range, reason, and separate Edit/Delete actions."
  );

  assert.match(
    panelSource,
    /function formatAbsenceTimeRange\(startTime = "", endTime = ""\) \{[\s\S]*return `\$\{normalizedStartTime\} - \$\{normalizedEndTime\}`[\s\S]*return "All day";/s,
    "Specialist absences table should format the stored time range for the dedicated Time column."
  );

  assert.match(
    panelSource,
    /for \(const id of itemIds\) \{[\s\S]*Specialist absence range deleted\./s,
    "Deleting a grouped specialist absence row should remove the whole saved range."
  );

  assert.match(
    panelSource,
    /const \[editingItem, setEditingItem\] = useState\(null\);[\s\S]*const openEditForm = useCallback\(\(item\) => \{[\s\S]*Edit Specialist Absence/s,
    "Specialist absences panel should reuse the modal for editing existing ranges."
  );

  assert.match(
    panelSource,
    /id="saveAppointmentSpecialistAbsenceBtn"[\s\S]*className="btn"[\s\S]*\{saving \? "Saving\.\.\." : "Save"\}/s,
    "Specialist absences modal should use the shared Save button styling and label."
  );

  assert.doesNotMatch(
    panelSource,
    /cancelAppointmentSpecialistAbsenceCreateBtn|>\s*Cancel\s*</s,
    "Specialist absences modal should not render a separate Cancel button."
  );
});
