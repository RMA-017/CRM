import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("statistics planner report detail table uses 20-row pagination", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/StatisticsPlannerReportPanel.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /import \{ ALL_USERS_LIMIT \} from "\.\.\/profile\.constants\.js";/,
    "Planner report should reuse the shared 20-row page size constant."
  );

  assert.match(
    source,
    /const \[page, setPage\] = useState\(1\);/,
    "Planner report should track the current detail page."
  );

  assert.match(
    source,
    /const totalPages = Math\.max\(1, Math\.ceil\(detailRows\.length \/ ALL_USERS_LIMIT\) \|\| 1\);/,
    "Planner report should compute total pages from the shared page size."
  );

  assert.match(
    source,
    /const visibleDetailRows = detailRows\.slice\(\s*\(safePage - 1\) \* ALL_USERS_LIMIT,\s*safePage \* ALL_USERS_LIMIT\s*\);/s,
    "Planner report should render only the current 20-row detail slice."
  );

  assert.match(
    source,
    /<div className="all-users-pagination"[\s\S]*Previous[\s\S]*Page \{safePage\} of \{totalPages\}[\s\S]*Next/s,
    "Planner report should render the shared pagination controls."
  );
});
