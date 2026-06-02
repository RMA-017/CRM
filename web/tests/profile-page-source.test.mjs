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
    /<th aria-label="Edit">✎<\/th>[\s\S]*<th aria-label="Delete">[\s\S]*<span className="table-trash-icon" aria-hidden="true" \/>/s,
    "Clients table headers should use the shared edit/delete icons."
  );
  assert.match(
    profileMainSource,
    /className="table-action-btn profile-table-icon-btn"[\s\S]*aria-label="Edit"[\s\S]*title="Edit"[\s\S]*✎[\s\S]*className="table-action-btn table-action-btn-danger profile-table-icon-btn"[\s\S]*aria-label="Delete"[\s\S]*<span className="table-trash-icon" aria-hidden="true" \/>/s,
    "Clients table actions should render compact icon buttons."
  );
  assert.match(
    stylesSource,
    /\.all-users-table \.profile-table-icon-btn \{[\s\S]*width: 30px;[\s\S]*height: 30px;[\s\S]*\.table-trash-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 13px;[\s\S]*\.table-trash-icon::before \{[\s\S]*width: calc\(100% \+ 4px\);[\s\S]*\.table-trash-icon::after \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/s,
    "Shared table icon CSS should keep action buttons compact and the trash lid closed."
  );
});

test("clients table uses a finance-style filter modal for column filters", async () => {
  const [clientsPanelSource, clientsHookSource, profilePageSource, profileMainSource, stylesSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/panels/ClientsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useClientsSection.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8")
  ]);

  assert.match(
    clientsPanelSource,
    /className="table-action-btn finance-head-icon-btn"[\s\S]*aria-label="Filter"[\s\S]*<span className="finance-head-icon finance-head-icon-filter" aria-hidden="true" \/>/s,
    "Clients panel should expose the same compact filter icon used in finance tables."
  );
  assert.match(
    clientsPanelSource,
    /id="clientsFilterModal"[\s\S]*className="logout-confirm-modal all-users-edit-modal finance-modal clients-filter-modal"[\s\S]*First Name[\s\S]*Last Name[\s\S]*Birthday From[\s\S]*Created To[\s\S]*Note/s,
    "Clients filter modal should include client table column filters."
  );
  assert.match(
    clientsPanelSource,
    /void loadClients\(1, \{[\s\S]*search: filterDraft\.search,[\s\S]*activeOnly: filterDraft\.activeOnly,[\s\S]*filters: \{[\s\S]*clientId: filterDraft\.clientId,[\s\S]*createdTo: filterDraft\.createdTo,[\s\S]*note: filterDraft\.note/s,
    "Clients filter modal should apply draft filters only when submitted."
  );
  assert.doesNotMatch(
    clientsPanelSource,
    /className="panel-search-bar"/,
    "Clients filters should no longer render as a separate search row."
  );
  assert.match(
    clientsHookSource,
    /const EMPTY_CLIENT_COLUMN_FILTERS = Object\.freeze\(\{[\s\S]*clientId: ""[\s\S]*createdTo: ""[\s\S]*note: ""[\s\S]*Object\.entries\(columnFilters\)\.forEach/s,
    "Clients hook should keep applied column filters and send them to the API."
  );
  assert.match(
    profilePageSource,
    /clientsColumnFilters,[\s\S]*clientsColumnFilters=\{clientsColumnFilters\}/s,
    "ProfilePage should pass applied client column filters down to the panel."
  );
  assert.match(
    profileMainSource,
    /clientsColumnFilters,[\s\S]*clientsColumnFilters=\{clientsColumnFilters\}/s,
    "ProfileMainContent should forward applied client column filters to ClientsPanel."
  );
  assert.match(
    stylesSource,
    /#clientsPanel \.all-users-head-actions \.finance-head-icon-btn \{[\s\S]*width: 30px;[\s\S]*#clientsFilterModal\.clients-filter-modal \{[\s\S]*width: min\(640px,[\s\S]*#clientsFilterModal \.clients-filter-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/s,
    "Clients filter modal should have the finance-style icon button and compact modal layout."
  );
});
