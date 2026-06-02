import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("statistics planner report detail table uses 20-row pagination and summary filters", async () => {
  const [source, css] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/StatisticsPlannerReportPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../src/css/components/components.css", import.meta.url),
      "utf8"
    )
  ]);

  assert.match(
    source,
    /\/api\/appointments\/report\/filters/,
    "Planner report toolbar should load scoped specialist options for the dashboard filter."
  );

  assert.match(
    source,
    /function getTodayBounds\(\) \{[\s\S]*const today = `\$\{year\}-\$\{month\}-\$\{day\}`;[\s\S]*from: today,[\s\S]*to: today[\s\S]*const initialBounds = getTodayBounds\(\);/s,
    "Profile dashboard should open with today's lessons only; wider report ranges should come from the date filters."
  );

  assert.match(
    source,
    /const requestId = reportRequestIdRef\.current \+ 1;[\s\S]*if \(requestId !== reportRequestIdRef\.current\) \{\s*return;\s*\}/s,
    "Planner report should ignore stale responses so rapid filter changes keep the latest result."
  );

  assert.match(
    source,
    /const \[appliedFilters, setAppliedFilters\] = useState\(\(\) => \(\{[\s\S]*fromDate: initialBounds\.from,[\s\S]*toDate: initialBounds\.to,[\s\S]*specialistId: ""[\s\S]*useEffect\(\(\) => \{[\s\S]*void loadReport\(\{[\s\S]*fromDate: appliedFilters\.fromDate,[\s\S]*toDate: appliedFilters\.toDate,[\s\S]*nextSpecialistId: appliedFilters\.specialistId[\s\S]*\}, \[appliedFilters, loadReport, showBootstrapSkeleton\]\);[\s\S]*onSubmit=\{\(event\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*setAppliedFilters\(\{[\s\S]*fromDate: from,[\s\S]*toDate: to,[\s\S]*specialistId[\s\S]*\}\);/s,
    "Planner report should keep toolbar filter changes local until Reload applies them."
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
    /PLANNER_REPORT_COLUMNS_STORAGE_KEY[\s\S]*DEFAULT_PLANNER_REPORT_COLUMN_IDS[\s\S]*"ticketDate"[\s\S]*"clientName"[\s\S]*"clientId"[\s\S]*"serviceName"[\s\S]*"specialistName"[\s\S]*"status"[\s\S]*"note"/s,
    "Planner report should keep the requested dashboard column order and persist visible columns."
  );

  assert.match(
    source,
    /const \[columnsOpen, setColumnsOpen\] = useState\(false\);[\s\S]*loadStoredPlannerReportColumnIds\(\)/s,
    "Planner report should track the dashboard table columns modal and visible column ids."
  );

  assert.match(
    source,
    /aria-label=\{translate\("Table columns"\)\}[\s\S]*finance-head-icon-columns[\s\S]*id="plannerReportColumnsModal"[\s\S]*plannerReportColumns\.map/s,
    "Planner report should render a table-columns button next to the close button."
  );

  assert.match(
    source,
    /id: "note"[\s\S]*label: "Note"[\s\S]*row\?\.note/s,
    "Planner report should render the appointment cancellation/no-show note column."
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
    css,
    /\.planner-report-summary-card\.is-cancelled \{[\s\S]*border-color: rgba\(100, 116, 139, 0\.75\);[\s\S]*background: linear-gradient\(180deg, rgba\(226, 232, 240, 0\.9\) 0%, rgba\(248, 250, 252, 0\.96\) 100%\);[\s\S]*\.planner-report-summary-card\.is-no-show \{[\s\S]*border-color: rgba\(225, 29, 72, 0\.82\);[\s\S]*background: linear-gradient\(180deg, rgba\(253, 164, 175, 0\.9\) 0%, rgba\(255, 241, 242, 0\.96\) 100%\);/s,
    "Planner report summary status cards should use the same cancelled and no-show colors as the appointment planner."
  );

  assert.match(
    css,
    /\.planner-report-cell-cancelled \{[\s\S]*color: #64748b;[\s\S]*\.planner-report-cell-no-show \{[\s\S]*color: #e11d48;/s,
    "Planner report detail status labels should use the same cancelled and no-show colors as the appointment planner."
  );

  assert.match(
    source,
    /<div className="all-users-pagination"[\s\S]*Previous[\s\S]*Page \{safePage\} of \{totalPages\}[\s\S]*Next/s,
    "Planner report should render the shared pagination controls."
  );
});
