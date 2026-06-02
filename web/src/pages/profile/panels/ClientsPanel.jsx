import { useState } from "react";
import { createPortal } from "react-dom";

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
  setClientsActiveOnly,
  clientsTableColumns = [],
  visibleClientsTableColumnIds = [],
  toggleClientsTableColumnVisibility
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);

  const closeColumns = () => {
    setColumnsOpen(false);
  };

  return (
    <section id="clientsPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>All Clients</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label="Столбцы таблицы"
            title="Столбцы таблицы"
            onClick={() => setColumnsOpen(true)}
          >
            <span className="finance-head-icon finance-head-icon-columns" aria-hidden="true" />
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

      {columnsOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label="Close"
            onClick={closeColumns}
          />
          <div id="clientsColumnsModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal clients-columns-modal">
            <h3>Столбцы таблицы</h3>
            <div className="finance-ticket-columns-list clients-columns-list">
              {clientsTableColumns.map((column) => {
                const checked = visibleClientsTableColumnIds.includes(column.id);
                return (
                  <label className="finance-ticket-column-option" key={column.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && visibleClientsTableColumnIds.length <= 1}
                      onChange={() => toggleClientsTableColumnVisibility?.(column.id)}
                    />
                    <span>{column.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ), document.body) : null}

      <form
        className="panel-search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          void loadClients(1, {
            search: clientsSearch,
            activeOnly: clientsActiveOnly,
            force: true
          });
        }}
      >
        <input
          type="search"
          className="panel-search-input"
          placeholder="Search by ID, name, phone..."
          value={clientsSearch}
          onChange={(event) => setClientsSearch(event.currentTarget.value)}
        />
        <label className="panel-search-checkbox">
          <input
            type="checkbox"
            checked={Boolean(clientsActiveOnly)}
            onChange={(event) => {
              const nextActiveOnly = event.currentTarget.checked;
              setClientsActiveOnly(nextActiveOnly);
              void loadClients(1, {
                search: clientsSearch,
                activeOnly: nextActiveOnly,
                force: true
              });
            }}
          />
          <span>Active</span>
        </label>
        <button type="submit" className="btn panel-search-btn" disabled={clientsLoading}>
          Search
        </button>
      </form>

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
