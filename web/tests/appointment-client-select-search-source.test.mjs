import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create client select exposes a search input in the dropdown", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /id="appointmentCreateClientSelect"[\s\S]*searchable[\s\S]*searchThreshold=\{0\}/,
    "Planner client select should open with searchable dropdown options."
  );
});
