import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";
import { formatDateYMD } from "../../lib/formatters.js";

const AllUsersPanel = lazy(() => import("./panels/AllUsersPanel.jsx"));
const AppointmentPlannerPanel = lazy(() => import("./panels/AppointmentPlannerPanel.jsx"));
const AppointmentSettingsShellPanel = lazy(() => import("./panels/AppointmentSettingsShellPanel.jsx"));
const ClientsPanel = lazy(() => import("./panels/ClientsPanel.jsx"));
const CrmLeadsPanel = lazy(() => import("./panels/CrmLeadsPanel.jsx"));
const MonitoringPanel = lazy(() => import("./MonitoringPanel.jsx"));
const OrganizationsSettingsPanel = lazy(() => import("./panels/OrganizationsSettingsPanel.jsx"));
const PositionsSettingsPanel = lazy(() => import("./panels/PositionsSettingsPanel.jsx"));
const ProfileEntityModals = lazy(() => import("./panels/ProfileEntityModals.jsx"));
const RolesSettingsPanel = lazy(() => import("./panels/RolesSettingsPanel.jsx"));
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
  canUpdateCrm,
  canReadAppointments,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  canReadAppointmentBreaks,
  canViewAppointmentSpecialistAbsenceBlocks,
  canReadStatisticsPlannerReportPermission,
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

  const clientsTable = useMemo(() => (
    <table className="all-users-table" aria-label="Clients table">
      <thead>
        <tr>
          <th>ID</th>
          <th>First Name</th>
          <th>Last Name</th>
          <th>Middle Name</th>
          <th>Birthday</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Active</th>
          <th>Created At</th>
          <th>Note</th>
          <th>Edit</th>
          <th>Delete</th>
        </tr>
      </thead>
      <tbody>
        {clientsLoading ? (
          [0, 1, 2, 3, 4].map((index) => (
            <tr key={index} aria-hidden="true">
              <td colSpan="12" className="skel" />
            </tr>
          ))
        ) : clients.map((item) => {
          const rowId = String(item?.id || "");
          const displayTgMail = String(
            item?.tgMail || item?.telegramOrEmail || item?.telegram_or_email || item?.tg_mail || ""
          ).trim();
          const displayNote = String(item?.note || "").trim() || "-";
          const createdAt = item?.createdAt || item?.created_at || "";

          return (
            <tr key={rowId}>
              <td>{rowId || "-"}</td>
              <td>{String(item?.firstName || item?.first_name || "").trim() || "-"}</td>
              <td>{String(item?.lastName || item?.last_name || "").trim() || "-"}</td>
              <td>{String(item?.middleName || item?.middle_name || "").trim() || "-"}</td>
              <td>{formatDateYMD(item?.birthday || item?.birthdate || "")}</td>
              <td>{item?.phone || item?.phone_number || "-"}</td>
              <td>{displayTgMail || "-"}</td>
              <td>{item?.isVip || item?.is_vip ? "Yes" : "No"}</td>
              <td>{formatDateYMD(createdAt)}</td>
              <td>{displayNote}</td>
              <td>
                <button
                  type="button"
                  className="table-action-btn"
                  disabled={!canUpdateClients}
                  onClick={() => startClientEdit(item)}
                >
                  Edit
                </button>
              </td>
              <td>
                <button
                  type="button"
                  className="table-action-btn table-action-btn-danger"
                  disabled={!canDeleteClients}
                  onClick={() => openClientsDeleteModal(item)}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  ), [canDeleteClients, canUpdateClients, clients, clientsLoading, openClientsDeleteModal, startClientEdit]);

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
              canReadReport={canReadStatisticsPlannerReportPermission}
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
