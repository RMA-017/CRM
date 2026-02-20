function ProfileSideMenu({
  menuRef,
  menuOpen,
  canReadClients,
  openClientsPanel,
  canReadAppointments,
  openAppointmentPanel,
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
            id="openClientsBtn"
            type="button"
            className="side-menu-action"
            hidden={!canReadClients}
            onClick={openClientsPanel}
          >
            Clients
          </button>
          <button
            id="openAppointmentBtn"
            type="button"
            className="side-menu-action"
            hidden={!canReadAppointments}
            onClick={openAppointmentPanel}
          >
            Appointment
          </button>
          <div id="usersMenuGroup" className="side-menu-group" hidden={!hasUsersMenuAccess}>
            <button
              id="toggleUsersMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={usersMenuOpen ? "true" : "false"}
              onClick={() => {
                setUsersMenuOpen((prev) => !prev);
                setSettingsMenuOpen(false);
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
