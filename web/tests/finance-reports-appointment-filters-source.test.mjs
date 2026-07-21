import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelSource = await readFile(
  new URL("../src/pages/profile/panels/FinanceReportsPanel.jsx", import.meta.url),
  "utf8"
);

const translationsSource = await readFile(
  new URL("../src/i18n/translations.js", import.meta.url),
  "utf8"
);

test("finance reports expose appointment date and lesson status filters", () => {
  assert.match(
    panelSource,
    /appointmentDateFrom: "",[\s\S]*appointmentDateTo: "",[\s\S]*appointmentStatus: ""/s,
    "Report filters should keep appointment date and status in the filter state."
  );

  assert.match(
    panelSource,
    /const APPOINTMENT_STATUS_OPTIONS = Object\.freeze\(\[[\s\S]*"pending"[\s\S]*"confirmed"[\s\S]*"cancelled"[\s\S]*"no-show"[\s\S]*\]\);/s,
    "The filter modal should offer the supported appointment statuses."
  );

  assert.match(
    panelSource,
    /\{ key: "appointmentDate", label: "Appointment Date" \}[\s\S]*\{ key: "appointmentStatus", label: "Appointment Status" \}/s,
    "Appointment date and appointment status should be available as report columns."
  );

  assert.match(
    panelSource,
    /appointmentStatus: \["appointmentDate"\]/,
    "Selecting appointment status should also reveal the appointment date column."
  );

  assert.match(
    panelSource,
    /renderDateRangeField\("appointmentDate", "Appointment Date", "appointmentDateFrom", "appointmentDateTo"\)[\s\S]*renderColumnToggle\("appointmentStatus", "Appointment Status"\)[\s\S]*APPOINTMENT_STATUS_OPTIONS[\s\S]*updateFilterValue\("appointmentStatus", value\)/s,
    "The filter modal should render appointment date and status controls."
  );

  assert.match(
    panelSource,
    /case "appointmentDate":[\s\S]*return formatDateYMD\(item\.appointmentDate\);[\s\S]*case "appointmentStatus":[\s\S]*getAppointmentStatusLabel\(translate, item\.appointmentStatus\)/s,
    "Report rows should render appointment date and appointment status values."
  );

  assert.match(
    translationsSource,
    /Appointment Date[\s\S]*Дата занятия[\s\S]*Appointment Status[\s\S]*Статус занятия/s,
    "Appointment report labels should be translated for the Russian and Uzbek UI."
  );

  assert.doesNotMatch(
    panelSource,
    /lostAmount|Lost Amount/,
    "The report should not expose a separate lost amount column; users can use service amount with appointment status instead."
  );
});
