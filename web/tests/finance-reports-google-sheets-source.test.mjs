import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelSource = await readFile(
  new URL("../src/pages/profile/panels/FinanceReportsPanel.jsx", import.meta.url),
  "utf8"
);
const styles = await readFile(
  new URL("../src/css/components/components.css", import.meta.url),
  "utf8"
);

test("finance reports exposes the yearly Google Sheets export workflow", () => {
  assert.match(
    panelSource,
    /aria-label=\{translate\("Export to Google Sheets"\)\}[\s\S]*finance-head-icon-google-sheets/s,
    "Reports should expose a dedicated Google Sheets icon button."
  );
  assert.match(panelSource, /const openGoogleSheetsExport = \(\) => \{[\s\S]*setGoogleSheetsOpen\(true\)/s);
  assert.match(
    panelSource,
    /id="financeGoogleSheetsExportModal"[\s\S]*type="url"[\s\S]*type="number"[\s\S]*Талоны[\s\S]*Транзакции[\s\S]*Балансы клиентов/s,
    "The export modal should collect the spreadsheet URL and year and show all managed tabs."
  );
  assert.match(
    panelSource,
    /\/api\/finance\/reports\/google-sheets\/config\?year=[\s\S]*\/api\/finance\/reports\/google-sheets\/export[\s\S]*JSON\.stringify\(\{ year, spreadsheetUrl \}\)/s,
    "The modal should load saved yearly settings and submit the export."
  );
  assert.match(
    styles,
    /\.finance-panel-shell \.all-users-head-actions \.finance-head-icon-btn[\s\S]*width: 30px;[\s\S]*height: 30px;/s,
    "The Google Sheets button should inherit the required stable 30 by 30 size."
  );
  assert.match(
    styles,
    /\.finance-google-sheets-fields[\s\S]*grid-template-columns:[\s\S]*@media \(max-width: 520px\)[\s\S]*grid-template-columns: 1fr;/s,
    "The modal fields should collapse cleanly on mobile."
  );
});
