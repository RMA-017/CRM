import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const EMPTY_CLIENT_FILTERS = Object.freeze({
  search: "",
  activeOnly: false,
  clientId: "",
  firstName: "",
  lastName: "",
  middleName: "",
  birthdayFrom: "",
  birthdayTo: "",
  phone: "",
  email: "",
  createdFrom: "",
  createdTo: "",
  note: ""
});

function createClientFilterDraft({
  clientsSearch = "",
  clientsActiveOnly = false,
  clientsColumnFilters = {}
} = {}) {
  return {
    ...EMPTY_CLIENT_FILTERS,
    search: String(clientsSearch || ""),
    activeOnly: Boolean(clientsActiveOnly),
    clientId: String(clientsColumnFilters?.clientId || ""),
    firstName: String(clientsColumnFilters?.firstName || ""),
    lastName: String(clientsColumnFilters?.lastName || ""),
    middleName: String(clientsColumnFilters?.middleName || ""),
    birthdayFrom: String(clientsColumnFilters?.birthdayFrom || ""),
    birthdayTo: String(clientsColumnFilters?.birthdayTo || ""),
    phone: String(clientsColumnFilters?.phone || ""),
    email: String(clientsColumnFilters?.email || ""),
    createdFrom: String(clientsColumnFilters?.createdFrom || ""),
    createdTo: String(clientsColumnFilters?.createdTo || ""),
    note: String(clientsColumnFilters?.note || "")
  };
}

function ClientsPanel({
  canCreateClients,
  openClientCreateModal,
  closeAllClientsPanel,
  clientsSearch,
  setClientsSearch,
  loadClients,
  clientsLoading,
  clientsMessage,
  clientsTable,
  clients,
  clientsPage,
  clientsTotalPages,
  clientsActiveOnly,
  clientsColumnFilters,
  setClientsActiveOnly
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(() => createClientFilterDraft({
    clientsSearch,
    clientsActiveOnly,
    clientsColumnFilters
  }));

  useEffect(() => {
    if (!filtersOpen) return;
    setFilterDraft(createClientFilterDraft({
      clientsSearch,
      clientsActiveOnly,
      clientsColumnFilters
    }));
  }, [clientsActiveOnly, clientsColumnFilters, clientsSearch, filtersOpen]);

  const updateFilterDraft = (key, value) => {
    setFilterDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const openFilters = () => {
    setFilterDraft(createClientFilterDraft({
      clientsSearch,
      clientsActiveOnly,
      clientsColumnFilters
    }));
    setFiltersOpen(true);
  };

  const closeFilters = () => {
    if (clientsLoading) return;
    setFiltersOpen(false);
  };

  const clearFilterDraft = () => {
    setFilterDraft({ ...EMPTY_CLIENT_FILTERS });
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setClientsSearch(filterDraft.search);
    setClientsActiveOnly(filterDraft.activeOnly);
    setFiltersOpen(false);
    void loadClients(1, {
      search: filterDraft.search,
      activeOnly: filterDraft.activeOnly,
      filters: {
        clientId: filterDraft.clientId,
        firstName: filterDraft.firstName,
        lastName: filterDraft.lastName,
        middleName: filterDraft.middleName,
        birthdayFrom: filterDraft.birthdayFrom,
        birthdayTo: filterDraft.birthdayTo,
        phone: filterDraft.phone,
        email: filterDraft.email,
        createdFrom: filterDraft.createdFrom,
        createdTo: filterDraft.createdTo,
        note: filterDraft.note
      },
      force: true
    });
  };

  return (
    <section id="clientsPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>All Clients</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label="Filter"
            title="Filter"
            onClick={openFilters}
          >
            <span className="finance-head-icon finance-head-icon-filter" aria-hidden="true" />
          </button>
          <button
            id="openClientsCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add client"
            title="Add client"
            hidden={!canCreateClients}
            onClick={openClientCreateModal}
          >
            +
          </button>
          <button
            id="closeAllClientsBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close all clients panel"
            onClick={closeAllClientsPanel}
          >
            ×
          </button>
        </div>
      </div>

      {filtersOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label="Close"
            onClick={closeFilters}
          />
          <div id="clientsFilterModal" className="logout-confirm-modal all-users-edit-modal finance-modal clients-filter-modal">
            <h3>Filter</h3>
            <form className="auth-form" onSubmit={applyFilters}>
              <div className="all-users-edit-fields settings-filter-grid clients-filter-grid">
                <label className="field clients-filter-full-row">
                  <span>Search</span>
                  <input
                    type="search"
                    value={filterDraft.search}
                    placeholder="ID, name, phone, email, note..."
                    onChange={(event) => updateFilterDraft("search", event.currentTarget.value)}
                  />
                </label>
                <label className="field">
                  <span>ID</span>
                  <input
                    type="number"
                    min="1"
                    value={filterDraft.clientId}
                    onChange={(event) => updateFilterDraft("clientId", event.currentTarget.value)}
                  />
                </label>
                <label className="field clients-filter-checkbox-field">
                  <span>Active</span>
                  <label className="clients-filter-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(filterDraft.activeOnly)}
                      onChange={(event) => updateFilterDraft("activeOnly", event.currentTarget.checked)}
                    />
                    <span>Active only</span>
                  </label>
                </label>
                <label className="field">
                  <span>First Name</span>
                  <input
                    type="text"
                    value={filterDraft.firstName}
                    onChange={(event) => updateFilterDraft("firstName", event.currentTarget.value)}
                  />
                </label>
                <label className="field">
                  <span>Last Name</span>
                  <input
                    type="text"
                    value={filterDraft.lastName}
                    onChange={(event) => updateFilterDraft("lastName", event.currentTarget.value)}
                  />
                </label>
                <label className="field">
                  <span>Middle Name</span>
                  <input
                    type="text"
                    value={filterDraft.middleName}
                    onChange={(event) => updateFilterDraft("middleName", event.currentTarget.value)}
                  />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input
                    type="text"
                    value={filterDraft.phone}
                    onChange={(event) => updateFilterDraft("phone", event.currentTarget.value)}
                  />
                </label>
                <label className="field clients-filter-full-row">
                  <span>Email / Telegram</span>
                  <input
                    type="text"
                    value={filterDraft.email}
                    onChange={(event) => updateFilterDraft("email", event.currentTarget.value)}
                  />
                </label>
                <div className="clients-filter-date-row">
                  <label className="field">
                    <span>Birthday From</span>
                    <input
                      type="date"
                      value={filterDraft.birthdayFrom}
                      onChange={(event) => updateFilterDraft("birthdayFrom", event.currentTarget.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Birthday To</span>
                    <input
                      type="date"
                      value={filterDraft.birthdayTo}
                      onChange={(event) => updateFilterDraft("birthdayTo", event.currentTarget.value)}
                    />
                  </label>
                </div>
                <div className="clients-filter-date-row">
                  <label className="field">
                    <span>Created From</span>
                    <input
                      type="date"
                      value={filterDraft.createdFrom}
                      onChange={(event) => updateFilterDraft("createdFrom", event.currentTarget.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Created To</span>
                    <input
                      type="date"
                      value={filterDraft.createdTo}
                      onChange={(event) => updateFilterDraft("createdTo", event.currentTarget.value)}
                    />
                  </label>
                </div>
                <label className="field clients-filter-full-row">
                  <span>Note</span>
                  <input
                    type="text"
                    value={filterDraft.note}
                    onChange={(event) => updateFilterDraft("note", event.currentTarget.value)}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="button" className="btn" disabled={clientsLoading} onClick={clearFilterDraft}>Clear</button>
                <button type="submit" className="btn btn-primary" disabled={clientsLoading}>Search</button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      <p className="all-users-state" hidden={clientsLoading || !clientsMessage}>
        {clientsMessage}
      </p>

      <div className="all-users-table-wrap">
        {clientsTable}
      </div>

      <div className="all-users-pagination" hidden={clientsLoading || clients.length === 0}>
        <button
          type="button"
          className="header-btn"
          disabled={clientsPage <= 1}
          onClick={() => loadClients(clientsPage - 1)}
        >
          Previous
        </button>
        <span className="all-users-page-info">
          Page {clientsPage} of {clientsTotalPages}
        </span>
        <button
          type="button"
          className="header-btn"
          disabled={clientsPage >= clientsTotalPages}
          onClick={() => loadClients(clientsPage + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default ClientsPanel;
