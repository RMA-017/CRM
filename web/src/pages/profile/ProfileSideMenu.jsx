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
  canReadAppointments,
  appointmentMenuOpen,
  setAppointmentMenuOpen,
  openAppointmentPanel,
  openAppointmentSettingsPanel,
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
  settingsMenuOpen,
  openOrganizationsPanel,
  openRolesPanel,
  openPositionsPanel
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
          <strong>Main Menu</strong>
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
              setUsersMenuOpen(false);
              setSettingsMenuOpen(false);
              setAppointmentMenuOpen(false);
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
          <div id="appointmentsMenuGroup" className="side-menu-group" hidden={!canReadAppointments}>
            <button
              id="toggleAppointmentsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={appointmentMenuOpen ? "true" : "false"}
              onClick={() => {
                setAppointmentMenuOpen((prev) => !prev);
                setClientsMenuOpen(false);
                setUsersMenuOpen(false);
                setSettingsMenuOpen(false);
              }}
            >
              Appointments
            </button>
            <div id="appointmentsSubMenu" className="side-submenu" hidden={!appointmentMenuOpen}>
              <button
                id="openAppointmentSettingsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openAppointmentSettingsPanel}
              >
                Settings
              </button>
              <button
                id="openAppointmentScheduleBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openAppointmentPanel}
              >
                Schedule
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
                setSettingsMenuOpen(false);
                setClientsMenuOpen(false);
                setAppointmentMenuOpen(false);
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
          <div id="settingsMenuGroup" className="side-menu-group" hidden={!hasSettingsMenuAccess}>
            <button
              id="toggleSettingsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={settingsMenuOpen ? "true" : "false"}
              onClick={() => {
                setSettingsMenuOpen((prev) => !prev);
                setUsersMenuOpen(false);
                setClientsMenuOpen(false);
                setAppointmentMenuOpen(false);
              }}
            >
              General Settings
            </button>
            <div id="settingsSubMenu" className="side-submenu" hidden={!settingsMenuOpen}>
              <button
                id="openOrganizationsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openOrganizationsPanel}
              >
                Organizations
              </button>
              <button
                id="openRolesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openRolesPanel}
              >
                Roles
              </button>
              <button
                id="openPositionsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
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
