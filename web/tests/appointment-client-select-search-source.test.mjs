import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create client select keeps the dropdown non-searchable", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    source,
    /id="appointmentCreateClientSelect"[\s\S]*searchable[\s\S]*searchThreshold=\{0\}/,
    "Planner client select should no longer open with a searchable dropdown."
  );
});
