import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ProfilePage forwards work-schedule action permissions to ProfileMainContent", async () => {
  const source = await readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /canCreateAppointmentWorkSchedule=\{canCreateAppointmentWorkSchedule\}/,
    "ProfilePage should forward work-schedule create access."
  );
  assert.match(
    source,
    /canUpdateAppointmentWorkSchedule=\{canUpdateAppointmentWorkSchedule\}/,
    "ProfilePage should forward work-schedule update access."
  );
  assert.match(
    source,
    /canDeleteAppointmentWorkSchedule=\{canDeleteAppointmentWorkSchedule\}/,
    "ProfilePage should forward work-schedule delete access."
  );
  assert.match(
    source,
    /canReadDashboardReport=\{canReadDashboardReport\}/,
    "ProfilePage should forward dashboard report access."
  );
});

test("profile dashboard allows specialist planner readers to see their own report", async () => {
  const profileMainSource = await readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8");

  assert.match(
    profileMainSource,
    /const canReadDashboardReportAccess = Boolean\([\s\S]*canReadDashboardReport[\s\S]*canReadStatisticsPlannerReportPermission[\s\S]*\(isSpecialistUser && canReadAppointments\)[\s\S]*\);/,
    "Dashboard report access should use the shared profile access flag and keep the specialist planner-read fallback."
  );
  assert.match(
    profileMainSource,
    /<StatisticsPlannerReportPanel[\s\S]*canReadReport=\{canReadDashboardReportAccess\}/s,
    "Profile dashboard should pass the combined specialist dashboard report access to the report panel."
  );
});

test("finance audit route is wired into profile navigation", async () => {
  const [appSource, profilePageSource, profileMainSource, sideMenuSource, panelSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceAuditPanel.jsx", import.meta.url), "utf8")
  ]);

  assert.match(
    appSource,
    /\{ path: "\/finance\/audit", forcedView: "finance-audit" \}/,
    "App should expose the finance audit profile route."
  );
  assert.match(
    profileMainSource,
    /const FinanceAuditPanel = lazy\(\(\) => import\("\.\/panels\/FinanceAuditPanel\.jsx"\)\);[\s\S]*mainView === "finance-audit"[\s\S]*<FinanceAuditPanel onClose=\{closeFinanceAuditPanel\}/s,
    "ProfileMainContent should lazy render the finance audit panel."
  );
  assert.match(
    sideMenuSource,
    /id="openFinanceAuditBtn"[\s\S]*hidden=\{!canOpenFinanceAudit\}[\s\S]*onClick=\{openFinanceAuditPanel\}[\s\S]*Аудит/s,
    "Side menu should show finance audit for users with access."
  );
  assert.match(
    profilePageSource,
    /canOpenFinanceAudit=\{canOpenFinanceAudit\}[\s\S]*openFinanceAuditPanel=\{openFinanceAuditPanel\}/s,
    "ProfilePage should forward finance audit access and navigation."
  );
  assert.match(
    panelSource,
    /\/api\/finance\/audit\?limit=100[\s\S]*Финансовый аудит[\s\S]*Ошибок не найдено\./s,
    "FinanceAuditPanel should load and display the backend audit result."
  );
});

test("finance client discounts route is wired into profile navigation", async () => {
  const [appSource, profilePageSource, profileMainSource, sideMenuSource, panelSource, stylesSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceClientDiscountsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8")
  ]);

  assert.match(
    appSource,
    /\{ path: "\/finance\/discounts", forcedView: "finance-discounts" \}/,
    "App should expose the finance client discounts profile route."
  );
  assert.match(
    profileMainSource,
    /const FinanceClientDiscountsPanel = lazy\(\(\) => import\("\.\/panels\/FinanceClientDiscountsPanel\.jsx"\)\);[\s\S]*mainView === "finance-discounts"[\s\S]*<FinanceClientDiscountsPanel[\s\S]*canCreateFinanceDiscounts=\{canCreateFinanceDiscounts\}[\s\S]*canUpdateFinanceDiscounts=\{canUpdateFinanceDiscounts\}/s,
    "ProfileMainContent should lazy render the finance client discounts panel."
  );
  assert.match(
    sideMenuSource,
    /id="openFinanceDiscountsBtn"[\s\S]*hidden=\{!canOpenFinanceDiscounts\}[\s\S]*onClick=\{openFinanceDiscountsPanel\}[\s\S]*Скидки клиентов/s,
    "Side menu should show finance client discounts for users with access."
  );
  assert.match(
    profilePageSource,
    /canOpenFinanceDiscounts=\{canOpenFinanceDiscounts\}[\s\S]*openFinanceDiscountsPanel=\{openFinanceDiscountsPanel\}/s,
    "ProfilePage should forward finance client discounts access and navigation."
  );
  assert.match(
    panelSource,
    /\/api\/finance\/discounts[\s\S]*New Client Discount[\s\S]*История использования/s,
    "FinanceClientDiscountsPanel should load the discounts list and expose create/detail flows."
  );
  assert.match(
    panelSource,
    /EMPTY_FILTERS[\s\S]*createdFrom[\s\S]*createdTo[\s\S]*client[\s\S]*service[\s\S]*isActive: "true"[\s\S]*Object\.entries\(nextFilters \|\| \{\}\)/s,
    "FinanceClientDiscountsPanel should default to active discounts and send filters to the backend list endpoint."
  );
  assert.match(
    panelSource,
    /className="table-action-btn finance-head-icon-btn"[\s\S]*aria-label=\{translate\("Filter"\)\}[\s\S]*finance-head-icon-filter/s,
    "FinanceClientDiscountsPanel should expose a finance-style filter icon button."
  );
  assert.match(
    panelSource,
    /id="financeClientDiscountFilterModal"[\s\S]*Created From[\s\S]*Created To[\s\S]*Client Name[\s\S]*Service Name[\s\S]*DISCOUNT_ACTIVE_FILTER_OPTIONS/s,
    "FinanceClientDiscountsPanel should render the requested client discount filter fields."
  );
  assert.doesNotMatch(
    panelSource,
    /setFilters\(\(current\) => \(\{[\s\S]{0,120}event\.currentTarget\.value/,
    "Client discount filter handlers should capture input values before running state updaters."
  );
  assert.match(
    panelSource,
    /finance-discounts-col-client[\s\S]*finance-discounts-col-client-id[\s\S]*<th>\{translate\("Client"\)\}<\/th>[\s\S]*<th>\{translate\("Client ID"\)\}<\/th>[\s\S]*colSpan=\{8\}[\s\S]*finance-discounts-cell-client-id/s,
    "Client discount table should show client id directly after the client name column."
  );
  assert.match(
    panelSource,
    /<th>\{translate\("Actions"\)\}<\/th>[\s\S]*onDoubleClick=\{\(\) => openDetail\(item\)\}[\s\S]*className="table-action-btn table-action-btn-danger finance-discounts-icon-btn"[\s\S]*aria-label=\{translate\("Disable"\)\}[\s\S]*onClick=\{\(\) => openDisableModal\(item\)\}[\s\S]*<span className="table-trash-icon" aria-hidden="true" \/>/s,
    "Client discount rows should open details on double-click and keep only a compact delete icon in actions."
  );
  assert.match(
    panelSource,
    /const \[disableTarget, setDisableTarget\] = useState\(null\);[\s\S]*const \[disableReason, setDisableReason\] = useState\(""\);[\s\S]*useEscapeKey\(Boolean\(disableTarget\), closeDisableModal\);[\s\S]*const submitDisableDiscount = useCallback[\s\S]*Disable reason is required\.[\s\S]*body: JSON\.stringify\(\{ isActive: false, disableReason: reason \}\)/s,
    "Disabling a client discount should require a reason before sending the inactive update."
  );
  assert.match(
    panelSource,
    /id="financeClientDiscountDisableModal"[\s\S]*placeholder=\{translate\("Disable reason"\)\}[\s\S]*maxLength=\{255\}[\s\S]*required[\s\S]*finance-discounts-disable-actions/s,
    "Client discount delete flow should render a compact required-reason modal."
  );
  assert.doesNotMatch(
    panelSource,
    /aria-label=\{translate\("Details"\)\}|finance-discounts-detail-icon|finance-discounts-enable-icon|toggleRuleActive/,
    "Client discount actions should not show a separate details or enable icon."
  );
  assert.match(
    panelSource,
    /finance-discounts-detail-head[\s\S]*finance-discounts-detail-body[\s\S]*finance-discounts-detail-summary[\s\S]*finance-discounts-detail-sections[\s\S]*finance-discounts-detail-section[\s\S]*finance-discounts-usage-scroll[\s\S]*finance-discounts-usage-col-date[\s\S]*finance-discounts-usage-col-service/s,
    "Client discount detail modal should keep header, summary, services and usage history in a compact structure."
  );
  assert.match(
    panelSource,
    /function formatServiceOptionLabel\(service\)[\s\S]*priceUzs[\s\S]*formatMoney\(priceUzs\)[\s\S]*discountServiceOptions[\s\S]*label: formatServiceOptionLabel\(service\)[\s\S]*selectedLabel: formatServiceOptionLabel\(service\)/s,
    "Create discount service options should show the service price in the dropdown and selected value."
  );
  assert.match(
    panelSource,
    /const clientResultsElement = showClientResults && modalRoot \? createPortal\(/,
    "Client search results should render through a portal so the modal does not clip them."
  );
  assert.match(
    panelSource,
    /ref=\{clientInputRef\}/,
    "Client search results should anchor to the client input."
  );
  assert.match(
    stylesSource,
    /#financeClientDiscountCreateModal \.finance-discounts-client-field > input \{[\s\S]*font-weight: 500;/s,
    "Selected client text in the create discount modal should not render bold."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-client-results \{[\s\S]*z-index: var\(--z-popover\);/s,
    "Client search results should be layered above the modal overlay."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-client-results button \{[\s\S]*font-weight: 500;/s,
    "Client search option labels should not render bold."
  );
  assert.match(
    stylesSource,
    /#financeClientDiscountFilterModal\.finance-discounts-filter-modal \{[\s\S]*width: min\(540px,[\s\S]*#financeClientDiscountFilterModal \.finance-discounts-filter-date-row/s,
    "Client discount filters should use the compact finance filter modal layout."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-col-client-id \{[\s\S]*width: 86px;[\s\S]*\.finance-discounts-cell-client-id \{[\s\S]*white-space: nowrap;[\s\S]*\.finance-discounts-cell-created \{[\s\S]*white-space: nowrap;/s,
    "Client discount client-id and created columns should stay compact without muted text styling."
  );
  assert.doesNotMatch(
    stylesSource,
    /\.finance-discounts-cell-client-id \{[^}]*color: var\(--text-muted\);|\.finance-discounts-cell-created \{[^}]*color: var\(--text-muted\);/s,
    "Client discount client-id and created cells should match the normal table text color."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-col-actions \{[\s\S]*width: 76px;[\s\S]*\.finance-discounts-table :is\(th:last-child, td:last-child\) \{[\s\S]*text-align: center;[\s\S]*\.finance-panel-shell \.finance-discount-actions \.finance-discounts-icon-btn \{[\s\S]*width: 30px;[\s\S]*height: 30px;/s,
    "Client discount actions column should fit the translated header while keeping one compact icon."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-detail-modal \{[\s\S]*width: min\(680px,[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*\.finance-discounts-detail-body \{[\s\S]*overflow: auto;[\s\S]*\.finance-discounts-disable-note \{[\s\S]*\.finance-discounts-detail-sections \{[\s\S]*gap: 10px;[\s\S]*\.finance-discounts-usage-scroll \{[\s\S]*max-height: 230px;[\s\S]*\.finance-discounts-usage-table \{[\s\S]*table-layout: fixed;/s,
    "Client discount detail modal should use compact dimensions and show disable audit notes without growing the modal."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-usage-col-date \{[\s\S]*width: 128px;[\s\S]*\.finance-discounts-usage-col-ticket \{[\s\S]*width: 68px;[\s\S]*\.finance-discounts-usage-col-discount \{[\s\S]*width: 96px;[\s\S]*\.finance-discounts-usage-col-status \{[\s\S]*width: 84px;[\s\S]*\.finance-discounts-usage-table :is\(th, td\) \{[\s\S]*text-overflow: ellipsis;/s,
    "Client discount usage history columns should keep compact metadata columns and leave room for service names."
  );
  assert.match(
    stylesSource,
    /\.finance-discounts-disable-modal \{[\s\S]*width: min\(430px,[\s\S]*\.finance-discounts-disable-body textarea \{[\s\S]*min-height: 92px;[\s\S]*\.finance-discounts-disable-actions \{[\s\S]*justify-content: center;/s,
    "Client discount disable modal should be compact and keep the submit action centered."
  );
});

test("user and client tables render edit and delete actions as compact icons", async () => {
  const [allUsersSource, profileMainSource, stylesSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/panels/AllUsersPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8")
  ]);

  assert.match(
    allUsersSource,
    /<th aria-label="Edit">✎<\/th>[\s\S]*<th aria-label="Delete">[\s\S]*<span className="table-trash-icon" aria-hidden="true" \/>/s,
    "All users table headers should use the shared edit/delete icons."
  );
  assert.match(
    allUsersSource,
    /className="table-action-btn profile-table-icon-btn"[\s\S]*aria-label="Edit"[\s\S]*title="Edit"[\s\S]*✎[\s\S]*className="table-action-btn table-action-btn-danger profile-table-icon-btn"[\s\S]*aria-label="Delete"[\s\S]*<span className="table-trash-icon" aria-hidden="true" \/>/s,
    "All users table actions should render compact icon buttons."
  );
  assert.match(
    profileMainSource,
    /id: "edit"[\s\S]*label: "Edit"[\s\S]*header: <span aria-hidden="true">✎<\/span>[\s\S]*id: "delete"[\s\S]*label: "Delete"[\s\S]*header: <span className="table-trash-icon" aria-hidden="true" \/>/s,
    "Clients table headers should use the shared edit/delete icons."
  );
  assert.match(
    profileMainSource,
    /className="table-action-btn profile-table-icon-btn"[\s\S]*aria-label="Edit"[\s\S]*title="Edit"[\s\S]*✎[\s\S]*className="table-action-btn table-action-btn-danger profile-table-icon-btn"[\s\S]*aria-label="Delete"[\s\S]*<span className="table-trash-icon" aria-hidden="true" \/>/s,
    "Clients table actions should render compact icon buttons."
  );
  assert.match(
    stylesSource,
    /\.all-users-table \.profile-table-icon-btn \{[\s\S]*width: 30px;[\s\S]*height: 30px;[\s\S]*\.table-trash-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 12px;[\s\S]*\.table-trash-icon::before \{[\s\S]*left: -1\.4px;[\s\S]*width: calc\(100% \+ 2\.8px\);[\s\S]*\.table-trash-icon::after \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/s,
    "Shared table icon CSS should keep action buttons compact and the trash lid closed."
  );
});

test("clients table uses a finance-style table columns modal", async () => {
  const [clientsPanelSource, clientsHookSource, profilePageSource, profileMainSource, stylesSource, responsiveStylesSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/panels/ClientsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useClientsSection.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/responsive.css", import.meta.url), "utf8")
  ]);

  assert.match(
    clientsPanelSource,
    /className="table-action-btn finance-head-icon-btn"[\s\S]*aria-label="Столбцы таблицы"[\s\S]*<span className="finance-head-icon finance-head-icon-columns" aria-hidden="true" \/>/s,
    "Clients panel should expose the same compact table columns icon used in finance tables."
  );
  assert.match(
    clientsPanelSource,
    /id="clientsColumnsModal"[\s\S]*className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal clients-columns-modal"[\s\S]*<h3>Столбцы таблицы<\/h3>[\s\S]*clientsTableColumns\.map[\s\S]*visibleClientsTableColumnIds\.includes\(column\.id\)/s,
    "Clients columns modal should render finance-style column checkboxes."
  );
  assert.match(
    clientsPanelSource,
    /className="panel-search-bar"[\s\S]*placeholder="Search by ID, name, phone\.\.\."/s,
    "Clients global search row should remain available outside the columns modal."
  );
  assert.match(
    clientsPanelSource,
    /void loadClients\(1, \{[\s\S]*search: clientsSearch,[\s\S]*activeOnly: clientsActiveOnly,[\s\S]*force: true/s,
    "Clients global search row should keep using the existing applied search and active filters."
  );
  assert.doesNotMatch(
    clientsPanelSource,
    /clientsFilterModal|finance-head-icon-filter|filterDraft/,
    "Clients panel should not render the mistaken filter modal."
  );
  assert.match(
    profileMainSource,
    /CLIENTS_TABLE_COLUMNS_STORAGE_KEY[\s\S]*DEFAULT_CLIENTS_TABLE_COLUMN_IDS[\s\S]*loadStoredClientsTableColumnIds[\s\S]*storeClientsTableColumnIds/s,
    "Client table column visibility should persist in localStorage like finance table columns."
  );
  assert.match(
    profileMainSource,
    /visibleClientsTableColumns\.map\(\(column\) => \([\s\S]*<th[\s\S]*key=\{column\.id\}[\s\S]*className=\{column\.className \|\| undefined\}[\s\S]*\{column\.header \|\| column\.label\}[\s\S]*colSpan=\{clientsTableVisibleColumnCount\}[\s\S]*visibleClientsTableColumns\.map\(\(column\) => \([\s\S]*<td key=\{column\.id\} className=\{column\.className \|\| undefined\}>\{column\.render\(item\)\}<\/td>/s,
    "Clients table should render only the selected visible columns."
  );
  assert.match(
    profileMainSource,
    /clientsTableVisibleDataColumnCount[\s\S]*const clientsTableStyle = useMemo\(\(\) => \(\{[\s\S]*"--clients-table-min-width"[\s\S]*clientsTableVisibleDataColumnCount \* 104[\s\S]*clientsTableVisibleActionColumnCount \* 42/s,
    "Clients table spacing should be recalculated from the currently visible columns."
  );
  assert.match(
    profileMainSource,
    /clientsTableColumns=\{clientsTableColumnOptions\}[\s\S]*visibleClientsTableColumnIds=\{visibleClientsTableColumnIds\}[\s\S]*toggleClientsTableColumnVisibility=\{toggleClientsTableColumnVisibility\}/s,
    "ProfileMainContent should pass client column controls to ClientsPanel."
  );
  assert.match(
    stylesSource,
    /#clientsPanel \.all-users-head-actions \.finance-head-icon-btn \{[\s\S]*width: 30px;[\s\S]*#clientsPanel \.clients-table \{[\s\S]*--clients-action-column-width: 42px;[\s\S]*min-width: var\(--clients-table-min-width[\s\S]*table-layout: auto;[\s\S]*clients-table-col-action[\s\S]*#clientsColumnsModal\.finance-ticket-columns-modal[\s\S]*#clientsColumnsModal \.finance-ticket-columns-list[\s\S]*#clientsColumnsModal \.finance-ticket-column-option/s,
    "Clients columns modal should reuse finance-style button and modal layout."
  );
  assert.doesNotMatch(
    responsiveStylesSource,
    /#clientsPanel \.all-users-table[\s\S]*min-width: 1280px|#clientsPanel \.all-users-table th:nth-child\(11\)|#clientsPanel \.all-users-table td:nth-child\(12\)/,
    "Clients responsive styles should not override dynamic visible-column table width or compact action columns."
  );
  assert.doesNotMatch(
    clientsHookSource + profilePageSource,
    /clientsColumnFilters|EMPTY_CLIENT_COLUMN_FILTERS|columnFilters/,
    "The mistaken API-backed column filter state should not remain."
  );
});
