import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP daily routine repeat chips reuse planner checkbox sizing styles", async () => {
  const [componentsCss, responsiveCss] = await Promise.all([
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/responsive.css", import.meta.url), "utf8")
  ]);

  assert.match(
    componentsCss,
    /#vipDailyRoutineEditModal \.vip-class-add-grid input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/,
    "VIP daily routine modal should exclude checkbox inputs from the generic full-width input rule."
  );

  assert.match(
    responsiveCss,
    /\.appointment-create-modal \.appointment-repeat-day-chip input\[type="checkbox"\],\s*#vipDailyRoutineEditModal \.appointment-repeat-day-chip input\[type="checkbox"\]/,
    "VIP daily routine modal should share the planner repeat checkbox sizing selector."
  );
});
