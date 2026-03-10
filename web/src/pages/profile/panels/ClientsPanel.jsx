import CustomSelect from "../../../components/CustomSelect.jsx";

function ClientsPanel({
  isClientMedicalHistoryView,
  canCreateClients,
  canCreateClientMedicalHistory,
  openClientCreateModal,
  openClientMedicalHistoryCreateModal,
  closeAllClientsPanel,
  clientsSearch,
  setClientsSearch,
  clientsIsVip,
  setClientsIsVip,
  loadCurrentClientsView,
  clientsLoading,
  clientsMessage,
  clientsTable,
  clients,
  clientsPage,
  clientsTotalPages
}) {
  return (
    <section id="clientsPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>{isClientMedicalHistoryView ? "Client Medical History" : "All Clients"}</h3>
        <div className="all-users-head-actions">
          <button
            id="openClientsCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add client"
            title="Add client"
            hidden={!canCreateClients || isClientMedicalHistoryView}
            onClick={openClientCreateModal}
          >
            +
          </button>
          <button
            id="openClientMedicalHistoryCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add medical history"
            title="Add medical history"
            hidden={!canCreateClientMedicalHistory || !isClientMedicalHistoryView}
            onClick={openClientMedicalHistoryCreateModal}
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
          void loadCurrentClientsView(1, {
            search: clientsSearch,
            isVip: clientsIsVip
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
        <div className="panel-search-select">
          <CustomSelect
            id="clientsVipFilterSelect"
            value={clientsIsVip}
            placeholder="All"
            options={[
              { value: "", label: "All" },
              { value: "true", label: "VIP" },
              { value: "false", label: "Non-VIP" }
            ]}
            onChange={setClientsIsVip}
            menuPortal
            maxVisibleOptions={3}
          />
        </div>
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
          onClick={() => loadCurrentClientsView(clientsPage - 1)}
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
          onClick={() => loadCurrentClientsView(clientsPage + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default ClientsPanel;
