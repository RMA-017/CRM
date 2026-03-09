function ProfileSideMenu({
  menuRef,
  menuOpen,
  isPlatformAdmin,
  hasClientsMenuAccess,
  canReadClients,
  canReadClientMedicalHistory,
  clientsMenuOpen,
  setClientsMenuOpen,
  openAllClientsPanel,
  openClientMedicalHistoryPanel,
  vipClientsMenuOpen,
  setVipClientsMenuOpen,
  assignmentsMenuOpen,
  setAssignmentsMenuOpen,
  hasAppointmentsMenuAccess,
  canOpenAppointmentSchedule,
  canOpenAppointmentVipMyClass,
  canOpenAppointmentBreaks,
  canOpenAppointmentVipClients,
  canOpenMyChildren,
  canOpenAppointmentVipDailyRoutines,
  canOpenAppointmentVipClassAssignments,
  canOpenAppointmentVipTutorAssignments,
  canOpenAppointmentVipAssignments,
  canOpenAppointmentStatistics,
  canOpenStatisticsClassAttendance,
  canOpenStatisticsPlannerReport,
  canOpenAppointmentSettings,
  canOpenSettingsOrganizations,
  canOpenSettingsRoles,
  canOpenSettingsPositions,
  appointmentMenuOpen,
  setAppointmentMenuOpen,
  openAppointmentPanel,
  openAppointmentBreaksPanel,
  openAppointmentWorkSchedulePanel,
  openAppointmentVipSchedulePanel,
  openAppointmentVipAttendancePanel,
  openAppointmentVipMyChildrenPanel,
  openAppointmentVipDailyRoutinesPanel,
  openAppointmentVipAssignmentsPanel,
  openAppointmentVipTutorAssignmentsPanel,
  openAppointmentSettingsPanel,
  statisticsMenuOpen,
  setStatisticsMenuOpen,
  openStatisticsClassPanel,
  openStatisticsPlannerReportPanel,
  hasUsersMenuAccess,
  usersMenuOpen,
  setUsersMenuOpen,
  setSettingsMenuOpen,
  adminSettingsMenuOpen,
  setAdminSettingsMenuOpen,
  canReadUsers,
  closeMenu,
  navigate,
  hasSettingsMenuAccess,
  hasAdminSettingsAccess,
  canSendNotifications,
  settingsMenuOpen,
  openOrganizationsPanel,
  openRolesPanel,
  openPositionsPanel,
  openNotificationsSendPanel,
  openMonitoringPanel
}) {
  return (
    <>
      <aside
        id="mainMenu"
        ref={menuRef}
        className={`side-menu${menuOpen ? " open" : ""}`}
        aria-label="Main menu"
        aria-hidden={menuOpen ? "false" : "true"}
      >
        <div className="side-menu-head">
          <img src="/crm.svg" alt="CRM logo" className="side-logo" />
          <strong>Menu</strong>
        </div>
        <nav className="side-menu-links">
          <button
            id="toggleClientsMenuBtn"
            type="button"
            className="side-menu-action side-menu-parent"
            hidden={!hasClientsMenuAccess}
            aria-expanded={clientsMenuOpen ? "true" : "false"}
            onClick={() => {
              setClientsMenuOpen((prev) => !prev);
            }}
          >
            Clients
          </button>
          <div id="clientsSubMenu" className="side-submenu" hidden={!clientsMenuOpen || !hasClientsMenuAccess}>
            <button
              id="openAllClientsBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canReadClients}
              onClick={openAllClientsPanel}
            >
              All Clients
            </button>
            <button
              id="openClientMedicalHistoryBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!(canReadClientMedicalHistory || isPlatformAdmin)}
              onClick={openClientMedicalHistoryPanel}
            >
              Medical History
            </button>
          </div>
          <button
            id="toggleVipClientsMenuBtn"
            type="button"
            className="side-menu-action side-menu-parent"
            hidden={!canOpenAppointmentVipMyClass && !canOpenAppointmentVipClients && !canOpenMyChildren && !canOpenAppointmentVipDailyRoutines}
            aria-expanded={vipClientsMenuOpen ? "true" : "false"}
            onClick={() => {
              setVipClientsMenuOpen((prev) => !prev);
            }}
          >
            VIP Clients
          </button>
          <div id="vipClientsSubMenu" className="side-submenu" hidden={!vipClientsMenuOpen}>
            <button
              id="openVipPlannerBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenAppointmentVipMyClass}
              onClick={openAppointmentVipSchedulePanel}
            >
              My Class
            </button>
            <button
              id="openVipAttendanceBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenAppointmentVipClients}
              onClick={openAppointmentVipAttendancePanel}
            >
              Attendance
            </button>
            <button
              id="openVipMyChildrenBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenMyChildren}
              onClick={openAppointmentVipMyChildrenPanel}
            >
              My Children
            </button>
            <button
              id="openVipDailyRoutinesBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenAppointmentVipDailyRoutines}
              onClick={openAppointmentVipDailyRoutinesPanel}
            >
              Daily Routines
            </button>
          </div>
          <button
            id="toggleAssignmentsMenuBtn"
            type="button"
            className="side-menu-action side-menu-parent"
            hidden={!canOpenAppointmentVipAssignments}
            aria-expanded={assignmentsMenuOpen ? "true" : "false"}
            onClick={() => {
              setAssignmentsMenuOpen((prev) => !prev);
            }}
          >
            Assignments
          </button>
          <div id="assignmentsSubMenu" className="side-submenu" hidden={!assignmentsMenuOpen || !canOpenAppointmentVipAssignments}>
            <button
              id="openVipAssignmentsBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenAppointmentVipClassAssignments}
              onClick={openAppointmentVipAssignmentsPanel}
            >
              Class
            </button>
            <button
              id="openVipTutorAssignmentsBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenAppointmentVipTutorAssignments}
              onClick={openAppointmentVipTutorAssignmentsPanel}
            >
              Tutor
            </button>
          </div>
          <div id="appointmentsMenuGroup" className="side-menu-group" hidden={!hasAppointmentsMenuAccess}>
            <button
              id="toggleAppointmentsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={appointmentMenuOpen ? "true" : "false"}
              onClick={() => {
                setAppointmentMenuOpen((prev) => !prev);
              }}
            >
              Appointments
            </button>
            <div id="appointmentsSubMenu" className="side-submenu" hidden={!appointmentMenuOpen}>
              <button
                id="openAppointmentBreaksBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentBreaks}
                onClick={openAppointmentBreaksPanel}
              >
                Breaks
              </button>
              <button
                id="openAppointmentScheduleBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentSchedule}
                onClick={openAppointmentPanel}
              >
                Planner
              </button>
              <button
                id="openAppointmentUserWeeklyOverridesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasSettingsMenuAccess}
                onClick={openAppointmentWorkSchedulePanel}
              >
                Work Schedule
              </button>
            </div>
          </div>
          <div id="usersMenuGroup" className="side-menu-group" hidden={!hasUsersMenuAccess && !hasAdminSettingsAccess}>
            <button
              id="toggleUsersMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={usersMenuOpen ? "true" : "false"}
              onClick={() => {
                setUsersMenuOpen((prev) => !prev);
              }}
            >
              Users
            </button>
            <div id="usersSubMenu" className="side-submenu" hidden={!usersMenuOpen}>
              <button
                id="openAllUsersBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canReadUsers && !hasAdminSettingsAccess}
                onClick={() => {
                  closeMenu();
                  navigate("/users/allusers");
                }}
              >
                All Users
              </button>
            </div>
          </div>
          <button
            id="openNotificationsSendBtn"
            type="button"
            className="side-menu-action"
            hidden={!canSendNotifications}
            onClick={openNotificationsSendPanel}
          >
            Notification
          </button>
          <div id="statisticsMenuGroup" className="side-menu-group" hidden={!canOpenAppointmentStatistics}>
            <button
              id="toggleStatisticsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={statisticsMenuOpen ? "true" : "false"}
              onClick={() => {
                setStatisticsMenuOpen((prev) => !prev);
              }}
            >
              Statistics
            </button>
            <div id="statisticsSubMenu" className="side-submenu" hidden={!statisticsMenuOpen}>
              <button
                id="openStatisticsClassBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenStatisticsClassAttendance}
                onClick={openStatisticsClassPanel}
              >
                VIP Class Attendance Report
              </button>
              <button
                id="openStatisticsPlannerReportBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenStatisticsPlannerReport}
                onClick={openStatisticsPlannerReportPanel}
              >
                Lesson Status Report
              </button>
            </div>
          </div>
          <div id="adminSettingsMenuGroup" className="side-menu-group" hidden={!hasAdminSettingsAccess}>
            <button
              id="toggleAdminSettingsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={adminSettingsMenuOpen ? "true" : "false"}
              onClick={() => {
                setAdminSettingsMenuOpen((prev) => !prev);
              }}
            >
              Admin Settings
            </button>
            <div id="adminSettingsSubMenu" className="side-submenu" hidden={!adminSettingsMenuOpen}>
              <button
                id="openOrganizationsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenSettingsOrganizations}
                onClick={openOrganizationsPanel}
              >
                Organizations
              </button>
              <button
                id="openMonitoringBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openMonitoringPanel}
              >
                Monitoring
              </button>
            </div>
          </div>
          <div id="settingsMenuGroup" className="side-menu-group" hidden={!hasSettingsMenuAccess}>
            <button
              id="toggleSettingsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={settingsMenuOpen ? "true" : "false"}
              onClick={() => {
                setSettingsMenuOpen((prev) => !prev);
              }}
            >
              Settings
            </button>
            <div id="settingsSubMenu" className="side-submenu" hidden={!settingsMenuOpen}>
              <button
                id="openAppointmentSettingsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentSettings}
                onClick={openAppointmentSettingsPanel}
              >
                Appointments
              </button>
              <button
                id="openRolesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenSettingsRoles}
                onClick={openRolesPanel}
              >
                Roles
              </button>
              <button
                id="openPositionsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenSettingsPositions}
                onClick={openPositionsPanel}
              >
                Positions
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <div id="menuOverlay" className="menu-overlay" hidden={!menuOpen} onClick={closeMenu} />
    </>
  );
}

export default ProfileSideMenu;
