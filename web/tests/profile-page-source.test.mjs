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
    /id="openFinanceDiscountsBtn"[\s\S]*hidden=\{!canOpenFinanceDiscounts\}[\s\S]*onClick=\{openFinanceDiscountsPanel\}[\s\S]*translate\("Client Discounts"\)/s,
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
    /const \[quickClientQuery, setQuickClientQuery\] = useState\(""\)[\s\S]*const nextFilters = \{ \.\.\.appliedFilters, client: normalizedClient \}[\s\S]*void loadDiscounts\(1, nextFilters\);[\s\S]*className="panel-search-input finance-board-head-client-filter finance-discounts-head-client-filter"[\s\S]*value=\{quickClientQuery\}[\s\S]*aria-label=\{translate\("Search by name or ID"\)\}[\s\S]*setQuickClientQuery\(value\)/s,
    "FinanceClientDiscountsPanel should expose a cashier-style quick client search in the header."
  );
  assert.match(
    panelSource,
    /id="financeClientDiscountFilterModal"[\s\S]*Created From[\s\S]*Created To[\s\S]*translate\("Client"\)[\s\S]*type="search"[\s\S]*value=\{filters\.client\}[\s\S]*placeholder=\{translate\("Search by name or ID"\)\}[\s\S]*Service Name[\s\S]*DISCOUNT_ACTIVE_FILTER_OPTIONS/s,
    "FinanceClientDiscountsPanel should render the requested client discount filter fields."
  );
  assert.match(
    panelSource,
    /const nextFilters = \{[\s\S]*\.\.\.filters,[\s\S]*client: String\(filters\.client \|\| ""\)\.trim\(\)[\s\S]*setFilters\(nextFilters\);[\s\S]*void loadDiscounts\(1, nextFilters\);/s,
    "Client discount filter should apply the visible client search input."
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
    /function getServicePriceUzs\(service\)[\s\S]*servicePriceUzs[\s\S]*function getServiceDiscountUzs\(service, discountType\)[\s\S]*function getServiceFinalPriceUzs\(service, discountType\)[\s\S]*finance-discounts-detail-service-metrics[\s\S]*translate\("Price"\)[\s\S]*translate\("Discount"\)[\s\S]*translate\("Final"\)/s,
    "Client discount detail services should show original price, discount amount and final discounted price."
  );
  assert.match(
    panelSource,
    /function isUnlimitedDiscountService\(service\)[\s\S]*const detailServicesAreAllUnlimited = detailServices\.length > 0 && detailServices\.every\(isUnlimitedDiscountService\);[\s\S]*detailServices\.map\(\(service\) =>[\s\S]*detailServicesAreAllUnlimited \? null : \([\s\S]*<h4>История использования<\/h4>/s,
    "Unlimited client discount details should keep services visible but hide the usage history list."
  );
  assert.doesNotMatch(
    panelSource + stylesSource,
    /formatUnlimitedServicesSummary|finance-discounts-detail-service-summary/,
    "Unlimited client discounts should not replace the selected services list with a summary row."
  );
  assert.match(
    panelSource,
    /function formatServiceOptionLabel\(service\)[\s\S]*priceUzs[\s\S]*formatMoney\(priceUzs\)[\s\S]*discountServiceOptions[\s\S]*label: formatServiceOptionLabel\(service\)[\s\S]*selectedLabel: formatServiceOptionLabel\(service\)/s,
    "Create discount service options should show the service price in the dropdown and selected value."
  );
  assert.match(
    panelSource,
    /const DISCOUNT_MAX_PERCENT_VALUE = 100;[\s\S]*function normalizeCreateDiscountValue\(discountType, value\)[\s\S]*amount > DISCOUNT_MAX_PERCENT_VALUE \? String\(DISCOUNT_MAX_PERCENT_VALUE\) : rawValue[\s\S]*field === "discountType"[\s\S]*setServiceRows\(\(current\) => current\.map\(\(row\) => \(\{[\s\S]*discountValue: normalizeCreateDiscountValue\(discountType, row\.discountValue\)[\s\S]*value=\{row\.discountValue\}[\s\S]*normalizeCreateDiscountValue\(createForm\.discountType, event\.currentTarget\.value\)/s,
    "New client discount modal should clamp each service row's percent discount to 100 while typing and when switching types."
  );
  assert.match(
    panelSource,
    /const servicePayload = \{[\s\S]*serviceId: row\.serviceId,[\s\S]*discountValue: toIntegerAmount\(row\.discountValue\),[\s\S]*isUnlimited: Boolean\(row\.isUnlimited\)[\s\S]*if \(!row\.isUnlimited\) \{[\s\S]*servicePayload\.limitCount = toIntegerAmount\(row\.limitCount\);[\s\S]*return servicePayload;[\s\S]*value === DISCOUNT_UNLIMITED_VALUE[\s\S]*updateServiceRow\(row\.key, \{ isUnlimited: true, limitCount: "" \}\)/s,
    "New client discount modal should send a per-service discount value and omit limitCount for unlimited service rows."
  );
  assert.match(
    panelSource,
    /const DISCOUNT_LIMIT_OPTIONS = Object\.freeze\(\[[\s\S]*DISCOUNT_UNLIMITED_VALUE[\s\S]*options=\{DISCOUNT_LIMIT_OPTIONS\}/s,
    "New client discount modal should keep the unlimited count option available."
  );
  assert.doesNotMatch(
    panelSource,
    /DISCOUNT_UNLIMITED_AMOUNT_ERROR|DISCOUNT_FINITE_LIMIT_OPTIONS|discountLimitOptions|hasUnlimitedServiceRows/,
    "The create discount modal should not block amount discounts from using unlimited counts."
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
    /\.finance-discounts-panel \.all-users-head-actions \.finance-discounts-head-client-filter \{[\s\S]*height: 30px;[\s\S]*#financeClientDiscountFilterModal\.finance-discounts-filter-modal \{[\s\S]*width: min\(540px,[\s\S]*#financeClientDiscountFilterModal \.finance-discounts-filter-date-row/s,
    "Client discount filters should use a compact header search and finance filter modal layout."
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
    /\.finance-discounts-detail-modal \{[\s\S]*width: min\(680px,[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);[\s\S]*\.finance-discounts-detail-body \{[\s\S]*overflow: auto;[\s\S]*\.finance-discounts-disable-note \{[\s\S]*\.finance-discounts-detail-sections \{[\s\S]*gap: 10px;[\s\S]*\.finance-discounts-detail-service-metrics \{[\s\S]*grid-template-columns: repeat\(3,[\s\S]*\.finance-discounts-usage-scroll \{[\s\S]*max-height: 230px;[\s\S]*\.finance-discounts-usage-table \{[\s\S]*table-layout: fixed;/s,
    "Client discount detail modal should use compact dimensions and show disable audit notes without growing the modal."
  );
  assert.doesNotMatch(
    panelSource + stylesSource,
    /finance-discounts-detail-loading|detailLoading/,
    "Client discount detail modal should not show a loading text while fetching details."
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

test("finance cashier appointment ticket modal previews client discounts", async () => {
  const cashierSource = await readFile(new URL("../src/pages/profile/panels/FinanceCashierPanel.jsx", import.meta.url), "utf8");

  assert.match(
    cashierSource,
    /const \[appointmentDiscountTouched, setAppointmentDiscountTouched\] = useState\(false\);[\s\S]*const \[appointmentDiscountLocked, setAppointmentDiscountLocked\] = useState\(false\);[\s\S]*const \[appointmentDiscountPreviewLoading, setAppointmentDiscountPreviewLoading\] = useState\(false\);[\s\S]*appointmentDiscountPreviewRequestRef/s,
    "Cashier appointment ticket modal should track automatic discount preview state."
  );
  assert.match(
    cashierSource,
    /ticket-discount-preview[\s\S]*body: JSON\.stringify\(\{[\s\S]*amountUzs: priceUzs,[\s\S]*items: \[\{[\s\S]*serviceId,[\s\S]*priceUzs[\s\S]*setAppointmentDiscountLocked\(discountUzs > 0 && Boolean\(previewItem\?\.clientDiscountRuleId\)\);[\s\S]*discountType: discountUzs > 0 \? discountType : "amount"[\s\S]*discountValue: String\(discountUzs > 0 \? discountValue : 0\)/s,
    "Cashier appointment ticket modal should fetch and apply automatic client discount previews."
  );
  assert.match(
    cashierSource,
    /setAppointmentDiscountTouched\(false\);[\s\S]*setAppointmentDiscountLocked\(false\);[\s\S]*serviceId: value,[\s\S]*discountType: "amount",[\s\S]*discountValue: "0"/s,
    "Changing appointment ticket service should reset manual discount state and refetch the automatic preview."
  );
  assert.match(
    cashierSource,
    /disabled=\{appointmentDiscountLocked \|\| appointmentDiscountPreviewLoading\}[\s\S]*if \(appointmentDiscountLocked \|\| appointmentDiscountPreviewLoading\) return;[\s\S]*setAppointmentDiscountTouched\(true\);[\s\S]*discountType: value,[\s\S]*discountValue: normalizeDiscountValueInput\(value, current\.discountValue\)[\s\S]*disabled=\{appointmentDiscountLocked \|\| appointmentDiscountPreviewLoading\}[\s\S]*if \(appointmentDiscountLocked \|\| appointmentDiscountPreviewLoading\) return;[\s\S]*const value = normalizeDiscountValueInput\(appointmentTicketForm\.discountType, event\.currentTarget\.value\);[\s\S]*setAppointmentDiscountTouched\(true\);[\s\S]*setAppointmentTicketForm\(\(current\) => \(\{ \.\.\.current, discountValue: value \}\)\)/s,
    "Manual edits to appointment ticket discounts should stop preview from overwriting cashier input."
  );
  assert.match(
    cashierSource,
    /const ticketItem = \{[\s\S]*serviceId,[\s\S]*priceUzs[\s\S]*if \(appointmentDiscountTouched\) \{[\s\S]*ticketItem\.discountType = appointmentTicketForm\.discountType;[\s\S]*ticketItem\.discountUzs = appointmentDiscountUzs;[\s\S]*payload\.items = \[ticketItem\];/s,
    "Automatic discount previews should stay display-only so the backend recalculates limits at ticket save time."
  );
  assert.match(
    cashierSource,
    /disabled=\{appointmentTicketSubmitting \|\| appointmentPriceUzs <= 0\}/,
    "Appointment tickets should still be saveable when an automatic discount makes the total zero."
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
