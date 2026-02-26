function ProfileSideMenu({
  menuRef,
  menuOpen,
  hasClientsMenuAccess,
  canReadClients,
  canCreateClients,
  clientsMenuOpen,
  setClientsMenuOpen,
  openAllClientsPanel,
  openCreateClientPanel,
  hasAppointmentsMenuAccess,
  canOpenAppointmentSchedule,
  canOpenAppointmentBreaks,
  canOpenAppointmentVipClients,
  appointmentMenuOpen,
  setAppointmentMenuOpen,
  openAppointmentPanel,
  openAppointmentBreaksPanel,
  openAppointmentSettingsPanel,
  openAppointmentVipClientsPanel,
  hasUsersMenuAccess,
  usersMenuOpen,
  setUsersMenuOpen,
  setSettingsMenuOpen,
  canReadUsers,
  closeMenu,
  navigate,
  canCreateUsers,
  openCreateUserPanel,
  hasSettingsMenuAccess,
  hasNotificationsSettingsAccess,
  settingsMenuOpen,
  openOrganizationsPanel,
  openRolesPanel,
  openPositionsPanel,
  openAdminOptionsPanel,
  openNotificationsSettingsPanel
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
              id="openCreateClientBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canCreateClients}
              onClick={openCreateClientPanel}
            >
              Create Client
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
                Schedule
              </button>
              <button
                id="openAppointmentVipClientsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentVipClients}
                onClick={openAppointmentVipClientsPanel}
              >
                VIP Clients
              </button>
            </div>
          </div>
          <div id="usersMenuGroup" className="side-menu-group" hidden={!hasUsersMenuAccess}>
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
                hidden={!canReadUsers}
                onClick={() => {
                  closeMenu();
                  navigate("/users/allusers");
                }}
              >
                All Users
              </button>
              <button
                id="openCreateUserBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canCreateUsers}
                onClick={openCreateUserPanel}
              >
                Create User
              </button>
            </div>
          </div>
          <div id="settingsMenuGroup" className="side-menu-group" hidden={!hasSettingsMenuAccess && !hasNotificationsSettingsAccess}>
            <button
              id="toggleSettingsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={settingsMenuOpen ? "true" : "false"}
              onClick={() => {
                setSettingsMenuOpen((prev) => !prev);
              }}
            >
              General Settings
            </button>
            <div id="settingsSubMenu" className="side-submenu" hidden={!settingsMenuOpen}>
              <button
                id="openAppointmentSettingsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasSettingsMenuAccess}
                onClick={openAppointmentSettingsPanel}
              >
                Appointments
              </button>
              <button
                id="openOrganizationsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasSettingsMenuAccess}
                onClick={openOrganizationsPanel}
              >
                Organizations
              </button>
              <button
                id="openRolesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasSettingsMenuAccess}
                onClick={openRolesPanel}
              >
                Roles
              </button>
              <button
                id="openPositionsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasSettingsMenuAccess}
                onClick={openPositionsPanel}
              >
                Positions
              </button>
              <button
                id="openAdminOptionsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasSettingsMenuAccess}
                onClick={openAdminOptionsPanel}
              >
                Admin Options
              </button>
              <button
                id="openNotificationsSettingsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!hasNotificationsSettingsAccess}
                onClick={openNotificationsSettingsPanel}
              >
                Notifications
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
