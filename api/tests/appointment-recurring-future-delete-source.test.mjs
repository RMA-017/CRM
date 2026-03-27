import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("recurring future delete truncates earlier series metadata before removing next items", async () => {
  const source = await readFile(new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url), "utf8");

  assert.match(
    source,
    /const canTruncateRecurringFutureDelete = target\.isRecurring && target\.scope === "future";[\s\S]*const previousSeriesItems = seriesItems\.filter\([\s\S]*const previousRepeatUntilDate = shiftDateYmd\(target\.anchorAppointmentDate, -1\);[\s\S]*await updateAppointmentScheduleByIdWithRepeatMeta\([\s\S]*repeatUntilDate: previousRepeatUntilDate,[\s\S]*isAutoRollingRepeat: false,[\s\S]*return deleteAppointmentSchedulesByIds\(/s,
    "Recurring future delete should trim the earlier series metadata before deleting upcoming appointments."
  );
});
