import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("statistics planner report detail table uses 20-row pagination and summary filters", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/StatisticsPlannerReportPanel.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /\/api\/appointments\/report\/filters\?includeAllClients=true/,
    "Planner report toolbar should load the full scoped client list so the Client filter is always usable."
  );

  assert.match(
    source,
    /const requestId = reportRequestIdRef\.current \+ 1;[\s\S]*if \(requestId !== reportRequestIdRef\.current\) \{\s*return;\s*\}/s,
    "Planner report should ignore stale responses so rapid filter changes keep the latest result."
  );

  assert.match(
    source,
    /useEffect\(\(\) => \{\s*if \(showBootstrapSkeleton \|\| !canReadReport\) \{\s*return;\s*\}[\s\S]*void loadReport\(\{[\s\S]*nextSpecialistId: specialistId,[\s\S]*nextClientId: clientId[\s\S]*\}\);/s,
    "Planner report should reload when toolbar filters change so specialist and client selects affect the report immediately."
  );

  assert.match(
    source,
    /mergePlannerReportSelectOptions[\s\S]*reportData\?\.details[\s\S]*specialistName[\s\S]*clientName/s,
    "Planner report toolbar should fall back to the currently loaded detail rows when filter metadata is empty."
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
    /const \[detailStatusFilter, setDetailStatusFilter\] = useState\("all"\);/,
    "Planner report should track the active summary-card status filter."
  );

  assert.match(
    source,
    /const filteredDetailRows = detailRows\.filter\(\(row\) => \(\s*detailStatusFilter === "all"[\s\S]*normalizePlannerReportStatusFilter\(row\?\.status\) === detailStatusFilter/s,
    "Planner report should filter detail rows by the selected summary status."
  );

  assert.match(
    source,
    /const totalPages = Math\.max\(1, Math\.ceil\(filteredDetailRows\.length \/ ALL_USERS_LIMIT\) \|\| 1\);/,
    "Planner report should compute total pages from the filtered detail row count."
  );

  assert.match(
    source,
    /const visibleDetailRows = filteredDetailRows\.slice\(\s*\(safePage - 1\) \* ALL_USERS_LIMIT,\s*safePage \* ALL_USERS_LIMIT\s*\);/s,
    "Planner report should render only the current 20-row filtered detail slice."
  );

  assert.match(
    source,
    /<article[\s\S]*className=\{`planner-report-summary-card \$\{item\.className\}\$\{isActive \? " is-active" : ""\}`\}[\s\S]*role="button"[\s\S]*setDetailStatusFilter\(\(current\) => \(\s*current === item\.key\s*\?\s*"all"\s*:\s*item\.key/s,
    "Planner report summary cards should toggle the detail status filter when clicked."
  );

  assert.match(
    source,
    /<div className="all-users-pagination"[\s\S]*Previous[\s\S]*Page \{safePage\} of \{totalPages\}[\s\S]*Next/s,
    "Planner report should render the shared pagination controls."
  );
});
