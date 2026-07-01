import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";
import { formatDateYMD } from "../../lib/formatters.js";

const AllUsersPanel = lazy(() => import("./panels/AllUsersPanel.jsx"));
const AppointmentPlannerPanel = lazy(() => import("./panels/AppointmentPlannerPanel.jsx"));
const AppointmentSettingsShellPanel = lazy(() => import("./panels/AppointmentSettingsShellPanel.jsx"));
const ClientsPanel = lazy(() => import("./panels/ClientsPanel.jsx"));
const CrmLeadsPanel = lazy(() => import("./panels/CrmLeadsPanel.jsx"));
const FinanceCashierPanel = lazy(() => import("./panels/FinanceCashierPanel.jsx"));
const FinanceSettingsPanel = lazy(() => import("./panels/FinanceSettingsPanel.jsx"));
const FinanceTicketsPanel = lazy(() => import("./panels/FinanceTicketsPanel.jsx"));
const FinanceTransactionsPanel = lazy(() => import("./panels/FinanceTransactionsPanel.jsx"));
const FinanceBalancesPanel = lazy(() => import("./panels/FinanceBalancesPanel.jsx"));
const FinanceDailyCashPanel = lazy(() => import("./panels/FinanceDailyCashPanel.jsx"));
const FinanceReportsPanel = lazy(() => import("./panels/FinanceReportsPanel.jsx"));
const MonitoringPanel = lazy(() => import("./MonitoringPanel.jsx"));
const OrganizationsSettingsPanel = lazy(() => import("./panels/OrganizationsSettingsPanel.jsx"));
const PositionsSettingsPanel = lazy(() => import("./panels/PositionsSettingsPanel.jsx"));
const ProfileEntityModals = lazy(() => import("./panels/ProfileEntityModals.jsx"));
const RolesSettingsPanel = lazy(() => import("./panels/RolesSettingsPanel.jsx"));
const ServicesPanel = lazy(() => import("./panels/ServicesPanel.jsx"));
const ServicesSettingsPanel = lazy(() => import("./panels/ServicesSettingsPanel.jsx"));
const SettingsCreateModals = lazy(() => import("./panels/SettingsCreateModals.jsx"));
const SiteContentPanel = lazy(() => import("./panels/SiteContentPanel.jsx"));
const StatisticsPlannerReportPanel = lazy(() => import("./panels/StatisticsPlannerReportPanel.jsx"));
const SmsNotificationsPanel = lazy(() => import("./panels/SmsNotificationsPanel.jsx"));
const TelegramBotSettingsPanel = lazy(() => import("./panels/TelegramBotSettingsPanel.jsx"));

const SPECIALIST_ROLE_MATCHERS = Object.freeze([
  "specialist",
  "spetsialist",
  "mutaxassis",
  "специалист"
]);

const PANEL_LOADING_FALLBACK = (
  <div className="all-users-panel" aria-hidden="true" />
);

const MODAL_LOADING_FALLBACK = null;

const CLIENTS_TABLE_COLUMNS_STORAGE_KEY = "aaron_crm_clients_table_columns";
const DEFAULT_CLIENTS_TABLE_COLUMN_IDS = Object.freeze([
  "id",
  "firstName",
  "lastName",
  "middleName",
  "birthday",
  "phone",
  "email",
  "active",
  "createdAt",
  "note",
  "edit",
  "delete"
]);

function loadStoredClientsTableColumnIds() {
  if (typeof window === "undefined") return [...DEFAULT_CLIENTS_TABLE_COLUMN_IDS];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLIENTS_TABLE_COLUMNS_STORAGE_KEY) || "[]");
    const stored = Array.isArray(parsed) ? parsed : [];
    const allowed = new Set(DEFAULT_CLIENTS_TABLE_COLUMN_IDS);
    const normalized = DEFAULT_CLIENTS_TABLE_COLUMN_IDS.filter((id) => stored.includes(id) && allowed.has(id));
    return normalized.length > 0 ? normalized : [...DEFAULT_CLIENTS_TABLE_COLUMN_IDS];
  } catch {
    return [...DEFAULT_CLIENTS_TABLE_COLUMN_IDS];
  }
}

function storeClientsTableColumnIds(columnIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLIENTS_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(columnIds));
  } catch {
    // Keep the current state even if browser storage is unavailable.
  }
}

function ProfileMainContent({
  mainView,
  allUsersLoading,
  allUsers,
  canUpdateUsers,
  canDeleteUsers,
  openAllUsersEditModal,
  openAllUsersDeleteModal,
  allUsersPage,
  allUsersTotalPages,
  allUsersSearch,
  setAllUsersSearch,
  loadAllUsers,
  closeAllUsersPanel,
  closeCreateUserPanel,
  clients,
  clientsLoading,
  clientsMessage,
  clientsPage,
  clientsTotalPages,
  clientsSearch,
  clientsActiveOnly,
  setClientsSearch,
  setClientsActiveOnly,
  loadClients,
  canCreateClients,
  canUpdateClients,
  canDeleteClients,
  clientCreateForm,
  clientCreateErrors,
  clientCreateSubmitting,
  setClientCreateForm,
  setClientCreateErrors,
  handleClientCreateSubmit,
  startClientEdit,
  openClientsDeleteModal,
  closeAllClientsPanel,
  closeCrmPanel,
  closeFinanceCashierPanel,
  closeFinanceTicketsPanel,
  closeFinanceTransactionsPanel,
  closeFinanceBalancesPanel,
  closeFinanceDailyCashPanel,
  closeFinanceReportsPanel,
  closeServicesPanel,
  canUpdateCrm,
  canCreateFinanceCashier,
  canUpdateFinanceCashier,
  canPayFinanceCashier,
  canUpdateFinanceBalances,
  canReadAppointments,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  canReadAppointmentBreaks,
  canViewAppointmentSpecialistAbsenceBlocks,
  canReadStatisticsPlannerReportPermission,
  canReadDashboardReport,
  canUpdateAppointmentBreaks,
  canUpdateSettingsAppointments,
  canUpdateSettingsTelegramBot,
  canSendSmsNotifications,
  canCreateAppointmentWorkSchedule,
  canUpdateAppointmentWorkSchedule,
  canDeleteAppointmentWorkSchedule,
  closeAppointmentPanel,
  closeAppointmentSettingsPanel,
  closeTelegramBotSettingsPanel,
  closeSmsNotificationsPanel,
  closeOrganizationsPanel,
  closeRolesPanel,
  closePositionsPanel,
  closeSettingsServicesPanel,
  closeSettingsFinancePanel,
  closeMonitoringPanel,
  closeSiteContentPanel,
  closeStatisticsPanel,
  organizations,
  organizationsMessage,
  organizationCreateForm,
  organizationCreateError,
  organizationCreateSubmitting,
  setOrganizationCreateForm,
  setOrganizationCreateError,
  handleOrganizationCreateSubmit,
  startOrganizationEdit,
  organizationDeletingId,
  handleOrganizationDelete,
  hasAdminSettingsAccess,
  canCreateSettingsOrganizations,
  canUpdateSettingsOrganizations,
  canDeleteSettingsOrganizations,
  rolesSettings,
  rolesSettingsMessage,
  rolePermissionTree,
  roleCreateForm,
  roleCreateError,
  roleCreateSubmitting,
  setRoleCreateForm,
  setRoleCreateError,
  handleRoleCreateSubmit,
  startRoleEdit,
  roleDeletingId,
  handleRoleDelete,
  canCreateSettingsRoles,
  canUpdateSettingsRoles,
  canDeleteSettingsRoles,
  positionsSettings,
  positionsSettingsMessage,
  positionCreateForm,
  positionCreateError,
  positionCreateSubmitting,
  setPositionCreateForm,
  setPositionCreateError,
  handlePositionCreateSubmit,
  startPositionEdit,
  positionDeletingId,
  handlePositionDelete,
  canCreateSettingsPositions,
  canUpdateSettingsPositions,
  canDeleteSettingsPositions,
  canCreateSettingsServices,
  canUpdateSettingsServices,
  canDeleteSettingsServices,
  canCreateSettingsFinance,
  canUpdateSettingsFinance,
  canDeleteSettingsFinance,
  canCreateUsers,
  handleCreateUserSubmit,
  createForm,
  createErrors,
  createSubmitting,
  createOrganizationOptions,
  setCreateForm,
  setCreateErrors,
  roleOptions,
  profile,
  canOpenSiteContent,
  canCreateSiteContent,
  canUpdateSiteContent,
  canDeleteSiteContent
}) {
  const [userCreateModalOpen, setUserCreateModalOpen] = useState(false);
  const [clientCreateModalOpen, setClientCreateModalOpen] = useState(false);
  const [organizationCreateModalOpen, setOrganizationCreateModalOpen] = useState(false);
  const [roleCreateModalOpen, setRoleCreateModalOpen] = useState(false);
  const [positionCreateModalOpen, setPositionCreateModalOpen] = useState(false);

  const profileRoleText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isSpecialistUser = SPECIALIST_ROLE_MATCHERS.some((matcher) => profileRoleText.includes(matcher));
  const canReadDashboardReportAccess = Boolean(
    canReadDashboardReport
    || canReadStatisticsPlannerReportPermission
    || (isSpecialistUser && canReadAppointments)
  );

  useEffect(() => {
    if (mainView === "create-user") {
      setUserCreateModalOpen(true);
      return;
    }
    setUserCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "clients-all") {
      return;
    }
    setClientCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-organizations") {
      return;
    }
    setOrganizationCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-roles") {
      return;
    }
    setRoleCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-positions") {
      return;
    }
    setPositionCreateModalOpen(false);
  }, [mainView]);

  const [visibleClientsTableColumnIds, setVisibleClientsTableColumnIds] = useState(() => loadStoredClientsTableColumnIds());

  const clientsTableColumns = useMemo(() => [
    {
      id: "id",
      label: "ID",
      className: "clients-table-col-id",
      render: (item) => String(item?.id || "").trim() || "-"
    },
    {
      id: "firstName",
      label: "First Name",
      className: "clients-table-col-first-name",
      render: (item) => String(item?.firstName || item?.first_name || "").trim() || "-"
    },
    {
      id: "lastName",
      label: "Last Name",
      className: "clients-table-col-last-name",
      render: (item) => String(item?.lastName || item?.last_name || "").trim() || "-"
    },
    {
      id: "middleName",
      label: "Middle Name",
      className: "clients-table-col-middle-name",
      render: (item) => String(item?.middleName || item?.middle_name || "").trim() || "-"
    },
    {
      id: "birthday",
      label: "Birthday",
      className: "clients-table-col-birthday",
      render: (item) => formatDateYMD(item?.birthday || item?.birthdate || "")
    },
    {
      id: "phone",
      label: "Phone",
      className: "clients-table-col-phone",
      render: (item) => item?.phone || item?.phone_number || "-"
    },
    {
      id: "email",
      label: "Email",
      className: "clients-table-col-email",
      render: (item) => String(
        item?.tgMail || item?.telegramOrEmail || item?.telegram_or_email || item?.tg_mail || ""
      ).trim() || "-"
    },
    {
      id: "active",
      label: "Active",
      className: "clients-table-col-active",
      render: (item) => (item?.isVip || item?.is_vip ? "Yes" : "No")
    },
    {
      id: "createdAt",
      label: "Created At",
      className: "clients-table-col-created-at",
      render: (item) => formatDateYMD(item?.createdAt || item?.created_at || "")
    },
    {
      id: "note",
      label: "Note",
      className: "clients-table-col-note",
      render: (item) => String(item?.note || "").trim() || "-"
    },
    {
      id: "edit",
      label: "Edit",
      className: "clients-table-col-action",
      isAction: true,
      header: <span aria-hidden="true">✎</span>,
      render: (item) => (
        <button
          type="button"
          className="table-action-btn profile-table-icon-btn"
          aria-label="Edit"
          title="Edit"
          disabled={!canUpdateClients}
          onClick={() => startClientEdit(item)}
        >
          ✎
        </button>
      )
    },
    {
      id: "delete",
      label: "Delete",
      className: "clients-table-col-action",
      isAction: true,
      header: <span className="table-trash-icon" aria-hidden="true" />,
      render: (item) => (
        <button
          type="button"
          className="table-action-btn table-action-btn-danger profile-table-icon-btn"
          aria-label="Delete"
          title="Delete"
          disabled={!canDeleteClients}
          onClick={() => openClientsDeleteModal(item)}
        >
          <span className="table-trash-icon" aria-hidden="true" />
        </button>
      )
    }
  ], [canDeleteClients, canUpdateClients, openClientsDeleteModal, startClientEdit]);

  const clientsTableColumnOptions = useMemo(
    () => clientsTableColumns.map((column) => ({ id: column.id, label: column.label })),
    [clientsTableColumns]
  );

  const visibleClientsTableColumns = useMemo(() => {
    const selected = new Set(visibleClientsTableColumnIds);
    const visible = clientsTableColumns.filter((column) => selected.has(column.id));
    return visible.length > 0 ? visible : clientsTableColumns;
  }, [clientsTableColumns, visibleClientsTableColumnIds]);

  const toggleClientsTableColumnVisibility = (columnId) => {
    const normalizedColumnId = String(columnId || "").trim();
    if (!DEFAULT_CLIENTS_TABLE_COLUMN_IDS.includes(normalizedColumnId)) return;
    setVisibleClientsTableColumnIds((current) => {
      const currentIds = Array.isArray(current) && current.length > 0
        ? current
        : [...DEFAULT_CLIENTS_TABLE_COLUMN_IDS];
      const selected = new Set(currentIds);
      if (selected.has(normalizedColumnId)) {
        if (selected.size <= 1) return currentIds;
        selected.delete(normalizedColumnId);
      } else {
        selected.add(normalizedColumnId);
      }
      const nextIds = DEFAULT_CLIENTS_TABLE_COLUMN_IDS.filter((id) => selected.has(id));
      storeClientsTableColumnIds(nextIds);
      return nextIds;
    });
  };

  const clientsTableVisibleColumnCount = visibleClientsTableColumns.length || 1;
  const clientsTableVisibleActionColumnCount = visibleClientsTableColumns.filter((column) => column.isAction).length;
  const clientsTableVisibleDataColumnCount = Math.max(
    1,
    clientsTableVisibleColumnCount - clientsTableVisibleActionColumnCount
  );
  const clientsTableStyle = useMemo(() => ({
    "--clients-table-min-width": `${Math.max(
      520,
      (clientsTableVisibleDataColumnCount * 104) + (clientsTableVisibleActionColumnCount * 42)
    )}px`
  }), [clientsTableVisibleActionColumnCount, clientsTableVisibleDataColumnCount]);

  const clientsTable = useMemo(() => (
    <table className="all-users-table clients-table" aria-label="Clients table" style={clientsTableStyle}>
      <thead>
        <tr>
          {visibleClientsTableColumns.map((column) => (
            <th
              key={column.id}
              className={column.className || undefined}
              aria-label={column.id === "edit" || column.id === "delete" ? column.label : undefined}
            >
              {column.header || column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clientsLoading ? (
          [0, 1, 2, 3, 4].map((index) => (
            <tr key={index} aria-hidden="true">
              <td colSpan={clientsTableVisibleColumnCount} className="skel" />
            </tr>
          ))
        ) : clients.map((item) => {
          const rowId = String(item?.id || "");
          return (
            <tr key={rowId}>
              {visibleClientsTableColumns.map((column) => (
                <td key={column.id} className={column.className || undefined}>{column.render(item)}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  ), [clients, clientsLoading, clientsTableStyle, clientsTableVisibleColumnCount, visibleClientsTableColumns]);

  const shouldRenderProfileEntityModals = userCreateModalOpen || clientCreateModalOpen;
  const shouldRenderSettingsCreateModals = (
    organizationCreateModalOpen
    || roleCreateModalOpen
    || positionCreateModalOpen
  );

  function openUserCreateModal() {
    setUserCreateModalOpen(true);
  }

  function closeUserCreateModal() {
    setUserCreateModalOpen(false);
  }

  function openClientCreateModal() {
    setClientCreateModalOpen(true);
  }

  function closeClientCreateModal() {
    setClientCreateModalOpen(false);
  }

  function openOrganizationCreateModal() {
    setOrganizationCreateModalOpen(true);
  }

  function closeOrganizationCreateModal() {
    setOrganizationCreateModalOpen(false);
  }

  function openRoleCreateModal() {
    setRoleCreateModalOpen(true);
  }

  function closeRoleCreateModal() {
    setRoleCreateModalOpen(false);
  }

  function openPositionCreateModal() {
    setPositionCreateModalOpen(true);
  }

  function closePositionCreateModal() {
    setPositionCreateModalOpen(false);
  }

  return (
    <>
      <main className="home-main" aria-label="Main content">
        {(mainView === "all-users" || mainView === "create-user") ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <AllUsersPanel
              isCreateUserView={mainView === "create-user"}
              canCreateUsers={canCreateUsers}
              openUserCreateModal={openUserCreateModal}
              closeCreateUserPanel={closeCreateUserPanel}
              closeAllUsersPanel={closeAllUsersPanel}
              allUsersSearch={allUsersSearch}
              setAllUsersSearch={setAllUsersSearch}
              loadAllUsers={loadAllUsers}
              allUsersLoading={allUsersLoading}
              allUsers={allUsers}
              canUpdateUsers={canUpdateUsers}
              canDeleteUsers={canDeleteUsers}
              openAllUsersEditModal={openAllUsersEditModal}
              openAllUsersDeleteModal={openAllUsersDeleteModal}
              allUsersPage={allUsersPage}
              allUsersTotalPages={allUsersTotalPages}
            />
          </Suspense>
        ) : null}

        {mainView === "clients-all" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <ClientsPanel
              canCreateClients={canCreateClients}
              openClientCreateModal={openClientCreateModal}
              closeAllClientsPanel={closeAllClientsPanel}
              clientsSearch={clientsSearch}
              clientsActiveOnly={clientsActiveOnly}
              setClientsSearch={setClientsSearch}
              setClientsActiveOnly={setClientsActiveOnly}
              clientsTableColumns={clientsTableColumnOptions}
              visibleClientsTableColumnIds={visibleClientsTableColumnIds}
              toggleClientsTableColumnVisibility={toggleClientsTableColumnVisibility}
              loadClients={loadClients}
              clientsLoading={clientsLoading}
              clientsMessage={clientsMessage}
              clientsTable={clientsTable}
              clients={clients}
              clientsPage={clientsPage}
              clientsTotalPages={clientsTotalPages}
            />
          </Suspense>
        ) : null}

        {mainView === "crm" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <CrmLeadsPanel
              canUpdateCrm={canUpdateCrm}
              canCreateClients={canCreateClients}
              onClose={closeCrmPanel}
            />
          </Suspense>
        ) : null}

        {mainView === "appointment" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <AppointmentPlannerPanel
              canReadAppointments={canReadAppointments}
              canReadAppointmentBreaks={canReadAppointmentBreaks}
              canViewAppointmentSpecialistAbsenceBlocks={canViewAppointmentSpecialistAbsenceBlocks}
              canReadStatisticsPlannerReport={canReadStatisticsPlannerReportPermission}
              canCreateAppointments={canCreateAppointments}
              canUpdateAppointments={canUpdateAppointments}
              canDeleteAppointments={canDeleteAppointments}
              canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
              canCreateAppointmentWorkSchedule={canCreateAppointmentWorkSchedule}
              canUpdateAppointmentWorkSchedule={canUpdateAppointmentWorkSchedule}
              canDeleteAppointmentWorkSchedule={canDeleteAppointmentWorkSchedule}
              currentUserId={String(profile?.id || "").trim()}
              restrictCreateToOwnSpecialist={isSpecialistUser}
              specialistLimitedEdit={isSpecialistUser}
              onClose={closeAppointmentPanel}
            />
          </Suspense>
        ) : null}

        {mainView === "finance-cashier" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceCashierPanel
              onClose={closeFinanceCashierPanel}
              canCreateFinanceCashier={canCreateFinanceCashier}
              canUpdateFinanceCashier={canUpdateFinanceCashier}
              canPayFinanceCashier={canPayFinanceCashier}
              currentUser={profile}
            />
          </Suspense>
        ) : null}

        {mainView === "finance-tickets" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceTicketsPanel
              onClose={closeFinanceTicketsPanel}
              canUpdateFinanceCashier={canUpdateFinanceCashier}
            />
          </Suspense>
        ) : null}

        {mainView === "finance-transactions" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceTransactionsPanel
              onClose={closeFinanceTransactionsPanel}
              canPayFinanceCashier={canPayFinanceCashier}
            />
          </Suspense>
        ) : null}

        {mainView === "finance-balances" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceBalancesPanel
              onClose={closeFinanceBalancesPanel}
              canUpdateFinanceBalances={canUpdateFinanceBalances}
            />
          </Suspense>
        ) : null}

        {mainView === "finance-daily-cash" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceDailyCashPanel
              onClose={closeFinanceDailyCashPanel}
              canPayFinanceCashier={canPayFinanceCashier}
              currentUser={profile}
            />
          </Suspense>
        ) : null}

        {mainView === "finance-reports" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceReportsPanel onClose={closeFinanceReportsPanel} />
          </Suspense>
        ) : null}

        {mainView === "appointment-settings" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <AppointmentSettingsShellPanel
              canUpdateAppointments={canUpdateAppointments}
              canUpdateSettingsAppointments={canUpdateSettingsAppointments}
              profile={profile}
              onClose={closeAppointmentSettingsPanel}
            />
          </Suspense>
        ) : null}

        {mainView === "telegram-bot-settings" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <TelegramBotSettingsPanel
              canUpdateSettingsTelegramBot={canUpdateSettingsTelegramBot}
              onClose={closeTelegramBotSettingsPanel}
            />
          </Suspense>
        ) : null}
        {mainView === "sms-notifications" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <SmsNotificationsPanel
              canSendSmsNotifications={canSendSmsNotifications}
              onClose={closeSmsNotificationsPanel}
            />
          </Suspense>
        ) : null}

        {mainView === "statistics-planner-report" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <StatisticsPlannerReportPanel
              closeStatisticsPanel={closeStatisticsPanel}
              showBootstrapSkeleton={!profile?.username}
              canReadReport={canReadDashboardReportAccess}
            />
          </Suspense>
        ) : null}

        {mainView === "settings-organizations" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <OrganizationsSettingsPanel
              canCreateSettingsOrganizations={canCreateSettingsOrganizations}
              canUpdateSettingsOrganizations={canUpdateSettingsOrganizations}
              canDeleteSettingsOrganizations={canDeleteSettingsOrganizations}
              openOrganizationCreateModal={openOrganizationCreateModal}
              closeOrganizationsPanel={closeOrganizationsPanel}
              organizationsMessage={organizationsMessage}
              organizations={organizations}
              startOrganizationEdit={startOrganizationEdit}
              organizationDeletingId={organizationDeletingId}
              handleOrganizationDelete={handleOrganizationDelete}
            />
          </Suspense>
        ) : null}

        {mainView === "settings-roles" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <RolesSettingsPanel
              canCreateSettingsRoles={canCreateSettingsRoles}
              canUpdateSettingsRoles={canUpdateSettingsRoles}
              canDeleteSettingsRoles={canDeleteSettingsRoles}
              hasAdminSettingsAccess={hasAdminSettingsAccess}
              openRoleCreateModal={openRoleCreateModal}
              closeRolesPanel={closeRolesPanel}
              rolesSettingsMessage={rolesSettingsMessage}
              rolesSettings={rolesSettings}
              startRoleEdit={startRoleEdit}
              roleDeletingId={roleDeletingId}
              handleRoleDelete={handleRoleDelete}
            />
          </Suspense>
        ) : null}

        {mainView === "settings-positions" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <PositionsSettingsPanel
              canCreateSettingsPositions={canCreateSettingsPositions}
              canUpdateSettingsPositions={canUpdateSettingsPositions}
              canDeleteSettingsPositions={canDeleteSettingsPositions}
              openPositionCreateModal={openPositionCreateModal}
              closePositionsPanel={closePositionsPanel}
              positionsSettingsMessage={positionsSettingsMessage}
              positionsSettings={positionsSettings}
              startPositionEdit={startPositionEdit}
              positionDeletingId={positionDeletingId}
              handlePositionDelete={handlePositionDelete}
            />
          </Suspense>
        ) : null}

        {mainView === "services" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <ServicesPanel onClose={closeServicesPanel} />
          </Suspense>
        ) : null}

        {mainView === "settings-services" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <ServicesSettingsPanel
              onClose={closeSettingsServicesPanel}
              canCreateSettingsServices={canCreateSettingsServices}
              canUpdateSettingsServices={canUpdateSettingsServices}
              canDeleteSettingsServices={canDeleteSettingsServices}
            />
          </Suspense>
        ) : null}

        {mainView === "settings-finance" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <FinanceSettingsPanel
              onClose={closeSettingsFinancePanel}
              canCreateSettingsFinance={canCreateSettingsFinance}
              canUpdateSettingsFinance={canUpdateSettingsFinance}
              canDeleteSettingsFinance={canDeleteSettingsFinance}
            />
          </Suspense>
        ) : null}

        {mainView === "settings-monitoring" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <MonitoringPanel onClose={closeMonitoringPanel} />
          </Suspense>
        ) : null}

        {mainView === "site-content" ? (
          <Suspense fallback={PANEL_LOADING_FALLBACK}>
            <SiteContentPanel
              onClose={closeSiteContentPanel}
              canOpenSiteContent={canOpenSiteContent}
              canCreateSiteContent={canCreateSiteContent}
              canUpdateSiteContent={canUpdateSiteContent}
              canDeleteSiteContent={canDeleteSiteContent}
            />
          </Suspense>
        ) : null}
      </main>

      {shouldRenderProfileEntityModals ? (
        <Suspense fallback={MODAL_LOADING_FALLBACK}>
          <ProfileEntityModals
            clientCreateModalOpen={clientCreateModalOpen}
            setClientCreateModalOpen={setClientCreateModalOpen}
            closeClientCreateModal={closeClientCreateModal}
            canCreateClients={canCreateClients}
            clientCreateForm={clientCreateForm}
            clientCreateErrors={clientCreateErrors}
            clientCreateSubmitting={clientCreateSubmitting}
            setClientCreateForm={setClientCreateForm}
            setClientCreateErrors={setClientCreateErrors}
            handleClientCreateSubmit={handleClientCreateSubmit}
            userCreateModalOpen={userCreateModalOpen}
            closeUserCreateModal={closeUserCreateModal}
            canCreateUsers={canCreateUsers}
            handleCreateUserSubmit={handleCreateUserSubmit}
            createForm={createForm}
            createErrors={createErrors}
            createSubmitting={createSubmitting}
            createOrganizationOptions={createOrganizationOptions}
            setCreateForm={setCreateForm}
            setCreateErrors={setCreateErrors}
            roleOptions={roleOptions}
          />
        </Suspense>
      ) : null}

      {shouldRenderSettingsCreateModals ? (
        <Suspense fallback={MODAL_LOADING_FALLBACK}>
          <SettingsCreateModals
            organizationCreateModalOpen={organizationCreateModalOpen}
            setOrganizationCreateModalOpen={setOrganizationCreateModalOpen}
            closeOrganizationCreateModal={closeOrganizationCreateModal}
            organizationCreateForm={organizationCreateForm}
            organizationCreateError={organizationCreateError}
            organizationCreateSubmitting={organizationCreateSubmitting}
            setOrganizationCreateForm={setOrganizationCreateForm}
            setOrganizationCreateError={setOrganizationCreateError}
            handleOrganizationCreateSubmit={handleOrganizationCreateSubmit}
            roleCreateModalOpen={roleCreateModalOpen}
            setRoleCreateModalOpen={setRoleCreateModalOpen}
            closeRoleCreateModal={closeRoleCreateModal}
            rolePermissionTree={rolePermissionTree}
            roleCreateForm={roleCreateForm}
            roleCreateError={roleCreateError}
            roleCreateSubmitting={roleCreateSubmitting}
            setRoleCreateForm={setRoleCreateForm}
            setRoleCreateError={setRoleCreateError}
            handleRoleCreateSubmit={handleRoleCreateSubmit}
            positionCreateModalOpen={positionCreateModalOpen}
            setPositionCreateModalOpen={setPositionCreateModalOpen}
            closePositionCreateModal={closePositionCreateModal}
            positionCreateForm={positionCreateForm}
            positionCreateError={positionCreateError}
            positionCreateSubmitting={positionCreateSubmitting}
            setPositionCreateForm={setPositionCreateForm}
            setPositionCreateError={setPositionCreateError}
            handlePositionCreateSubmit={handlePositionCreateSubmit}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export default memo(ProfileMainContent);
