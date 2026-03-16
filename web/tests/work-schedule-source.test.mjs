import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Work schedule panel includes a panel-style search bar and filters visible rows", async () => {
  const source = await readFile(new URL("../src/pages/profile/WorkSchedulePanel.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /className="panel-search-bar"/,
    "Work schedule panel should render the shared panel search bar."
  );
  assert.match(
    source,
    /const \[weeklySearchInput, setWeeklySearchInput\] = useState\(""\);/,
    "Work schedule panel should keep local search input state."
  );
  assert.match(
    source,
    /filteredWeeklyItems/,
    "Work schedule panel should derive filtered rows from the full weekly list."
  );
  assert.match(
    source,
    /<th>Full Name<\/th>/,
    "Work schedule panel should render full names in the weekly overrides table."
  );
  assert.match(
    source,
    /Add Blocked Time/,
    "Work schedule panel should label weekly overrides as blocked time instead of work days."
  );
});
