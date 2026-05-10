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
  setClientsActiveOnly
}) {
  return (
    <section id="clientsPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>All Clients</h3>
        <div className="all-users-head-actions">
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
