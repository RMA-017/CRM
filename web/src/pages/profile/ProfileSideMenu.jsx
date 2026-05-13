import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CLOSED_SUBMENUS = Object.freeze({
  clients: false,
  appointments: false,
  users: false,
  site: false,
  settings: false,
  adminSettings: false
});

const ProfileSideMenu = memo(forwardRef(function ProfileSideMenu({
  menuRef,
  hasClientsMenuAccess,
  canReadClients,
  openAllClientsPanel,
  hasAppointmentsMenuAccess,
  canOpenAppointmentSchedule,
  canOpenAppointmentSettings,
  canOpenTelegramBotSettings,
  canOpenSmsNotifications,
  openAppointmentPanel,
  openAppointmentSettingsPanel,
  openTelegramBotSettingsPanel,
  openSmsNotificationsPanel,
  hasUsersMenuAccess,
  canReadUsers,
  closeMenu,
  navigate,
  hasSettingsMenuAccess,
  hasAdminSettingsAccess,
  canOpenSettingsOrganizations,
  canOpenSettingsRoles,
  canOpenSettingsPositions,
  openOrganizationsPanel,
  openRolesPanel,
  openPositionsPanel,
  openMonitoringPanel,
  canOpenSiteContent,
  openSiteContentPanel
}, ref) {
  const [openSubmenus, setOpenSubmenus] = useState(CLOSED_SUBMENUS);
  const menuElementRef = useRef(null);
  const overlayElementRef = useRef(null);
  const menuOpenRef = useRef(false);
  const blurFocusedMenuElement = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const menuElement = menuRef?.current;
    const activeElement = document.activeElement;
    if (
      menuElement
      && activeElement instanceof HTMLElement
      && menuElement.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }, [menuRef]);

  const assignMenuElement = useCallback((node) => {
    menuElementRef.current = node;
    if (typeof menuRef === "function") {
      menuRef(node);
      return;
    }
    if (menuRef && typeof menuRef === "object") {
      menuRef.current = node;
    }
  }, [menuRef]);

  const setBodyMenuState = useCallback((isOpen) => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("side-menu-open", isOpen);
    }
  }, []);

  const setMenuShellState = useCallback((isOpen) => {
    const menuElement = menuElementRef.current;
    if (menuElement) {
      menuElement.classList.toggle("open", isOpen);
      menuElement.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }

    const overlayElement = overlayElementRef.current;
    if (overlayElement) {
      overlayElement.classList.toggle("open", isOpen);
      overlayElement.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }
  }, []);

  const toggleSubmenu = useCallback((key) => {
    setOpenSubmenus((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }, []);

  const closeSideMenu = useCallback(() => {
    if (!menuOpenRef.current) {
      return;
    }
    blurFocusedMenuElement();
    menuOpenRef.current = false;
    setOpenSubmenus(CLOSED_SUBMENUS);
    setMenuShellState(false);
    setBodyMenuState(false);
  }, [blurFocusedMenuElement, setBodyMenuState, setMenuShellState]);

  useEffect(() => (
    () => {
      setMenuShellState(false);
      if (typeof document !== "undefined") {
        document.body.classList.remove("side-menu-open");
      }
    }
  ), [setMenuShellState]);

  useImperativeHandle(ref, () => ({
    open() {
      if (menuOpenRef.current) {
        return;
      }
      menuOpenRef.current = true;
      setBodyMenuState(true);
      setMenuShellState(true);
    },
    close() {
      closeSideMenu();
    }
  }), [closeSideMenu, setBodyMenuState, setMenuShellState]);

  const menuShell = (
    <>
      <aside
        id="mainMenu"
        ref={assignMenuElement}
        className="side-menu"
        aria-label="Main menu"
        aria-hidden="true"
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
            aria-expanded={openSubmenus.clients ? "true" : "false"}
            onClick={() => {
              toggleSubmenu("clients");
            }}
          >
            Clients
          </button>
          <div id="clientsSubMenu" className="side-submenu" hidden={!openSubmenus.clients || !hasClientsMenuAccess}>
            <button
              id="openAllClientsBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canReadClients}
              onClick={openAllClientsPanel}
            >
              All Clients
            </button>
          </div>

          <div id="appointmentsMenuGroup" className="side-menu-group" hidden={!hasAppointmentsMenuAccess}>
            <button
              id="toggleAppointmentsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={openSubmenus.appointments ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("appointments");
              }}
            >
              Appointments
            </button>
            <div id="appointmentsSubMenu" className="side-submenu" hidden={!openSubmenus.appointments}>
              <button
                id="openAppointmentScheduleBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentSchedule}
                onClick={openAppointmentPanel}
              >
                Planner
              </button>
            </div>
          </div>

          <div id="usersMenuGroup" className="side-menu-group" hidden={!hasUsersMenuAccess && !hasAdminSettingsAccess}>
            <button
              id="toggleUsersMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={openSubmenus.users ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("users");
              }}
            >
              Users
            </button>
            <div id="usersSubMenu" className="side-submenu" hidden={!openSubmenus.users}>
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

          <div id="siteMenuGroup" className="side-menu-group" hidden={!canOpenSiteContent}>
            <button
              id="toggleSiteMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={openSubmenus.site ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("site");
              }}
            >
              Website Management
            </button>
            <div id="siteSubMenu" className="side-submenu" hidden={!openSubmenus.site}>
              <button
                id="openSiteKidsContentBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={() => openSiteContentPanel("kids")}
              >
                Children's Creativity
              </button>
              <button
                id="openSiteBlogContentBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={() => openSiteContentPanel("blog")}
              >
                Articles
              </button>
              <button
                id="openSiteTeamContentBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={() => openSiteContentPanel("team")}
              >
                Our Specialists
              </button>
              <button
                id="openSitePartnersContentBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={() => openSiteContentPanel("partners")}
              >
                Partners
              </button>
            </div>
          </div>

          <button
            id="openSmsNotificationsBtn"
            type="button"
            className="side-menu-action side-menu-parent"
            hidden={!canOpenSmsNotifications}
            onClick={openSmsNotificationsPanel}
          >
            SMS xabarnoma
          </button>

          <div id="adminSettingsMenuGroup" className="side-menu-group" hidden={!hasAdminSettingsAccess}>
            <button
              id="toggleAdminSettingsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={openSubmenus.adminSettings ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("adminSettings");
              }}
            >
              Admin Settings
            </button>
            <div id="adminSettingsSubMenu" className="side-submenu" hidden={!openSubmenus.adminSettings}>
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
              aria-expanded={openSubmenus.settings ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("settings");
              }}
            >
              Settings
            </button>
            <div id="settingsSubMenu" className="side-submenu" hidden={!openSubmenus.settings}>
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
                id="openTelegramBotSettingsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenTelegramBotSettings}
                onClick={openTelegramBotSettingsPanel}
              >
                Telegram Bot
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

      <div
        id="menuOverlay"
        ref={overlayElementRef}
        className="menu-overlay"
        aria-hidden="true"
        onClick={closeMenu}
      />
    </>
  );

  if (typeof document === "undefined") {
    return menuShell;
  }

  return createPortal(menuShell, document.body);
}));

export default ProfileSideMenu;
