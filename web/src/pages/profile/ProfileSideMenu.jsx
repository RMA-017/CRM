import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const CLOSE_ANIMATION_MS = 90;
const CLOSED_SUBMENUS = Object.freeze({
  clients: false,
  vipClients: false,
  assignments: false,
  appointments: false,
  users: false,
  statistics: false,
  settings: false,
  adminSettings: false
});

const ProfileSideMenu = forwardRef(function ProfileSideMenu({
  menuRef,
  isPlatformAdmin,
  hasClientsMenuAccess,
  canReadClients,
  canReadClientMedicalHistory,
  openAllClientsPanel,
  openClientMedicalHistoryPanel,
  hasAppointmentsMenuAccess,
  canOpenAppointmentSchedule,
  canOpenAppointmentVipMyClass,
  canOpenAppointmentBreaks,
  canOpenAppointmentSpecialistAbsences,
  canOpenAppointmentWorkSchedule,
  canOpenAppointmentVipClients,
  canOpenAppointmentVipNormMonitoring,
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
  canOpenSettingsNorms,
  openAppointmentPanel,
  openAppointmentBreaksPanel,
  openAppointmentSpecialistAbsencesPanel,
  openAppointmentWorkSchedulePanel,
  openAppointmentVipSchedulePanel,
  openAppointmentVipAttendancePanel,
  openAppointmentVipNormMonitoringPanel,
  openAppointmentVipMyChildrenPanel,
  openAppointmentVipDailyRoutinesPanel,
  openAppointmentVipAssignmentsPanel,
  openAppointmentVipTutorAssignmentsPanel,
  openAppointmentSettingsPanel,
  openStatisticsClassPanel,
  openStatisticsPlannerReportPanel,
  hasUsersMenuAccess,
  canReadUsers,
  closeMenu,
  navigate,
  hasSettingsMenuAccess,
  hasAdminSettingsAccess,
  canSendNotifications,
  openOrganizationsPanel,
  openRolesPanel,
  openPositionsPanel,
  openNormsPanel,
  openNotificationsSendPanel,
  openMonitoringPanel
}, ref) {
  const closeTimerRef = useRef(null);
  const [menuState, setMenuState] = useState("closed");
  const [openSubmenus, setOpenSubmenus] = useState(CLOSED_SUBMENUS);

  function blurFocusedMenuElement() {
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
  }

  function resetSubmenus() {
    setOpenSubmenus((current) => (
      current.clients
      || current.vipClients
      || current.assignments
      || current.appointments
      || current.users
      || current.statistics
      || current.settings
      || current.adminSettings
        ? CLOSED_SUBMENUS
        : current
    ));
  }

  function toggleSubmenu(key) {
    setOpenSubmenus((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    open() {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setMenuState("open");
    },
    close() {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      blurFocusedMenuElement();
      setMenuState((current) => (current === "closed" ? "closed" : "closing"));
      closeTimerRef.current = setTimeout(() => {
        setMenuState("closed");
        resetSubmenus();
        closeTimerRef.current = null;
      }, CLOSE_ANIMATION_MS);
    }
  }), []);

  return (
    <>
      <aside
        id="mainMenu"
        ref={menuRef}
        className={`side-menu${menuState === "open" ? " open" : ""}${menuState === "closing" ? " closing" : ""}`}
        aria-label="Main menu"
        aria-hidden={menuState === "closed" ? "true" : "false"}
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
            hidden={!canOpenAppointmentVipMyClass && !canOpenAppointmentVipClients && !canOpenAppointmentVipNormMonitoring && !canOpenMyChildren && !canOpenAppointmentVipDailyRoutines}
            aria-expanded={openSubmenus.vipClients ? "true" : "false"}
            onClick={() => {
              toggleSubmenu("vipClients");
            }}
          >
            VIP Clients
          </button>
          <div id="vipClientsSubMenu" className="side-submenu" hidden={!openSubmenus.vipClients}>
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
              id="openVipNormMonitoringBtn"
              type="button"
              className="side-submenu-link side-submenu-action"
              hidden={!canOpenAppointmentVipNormMonitoring}
              onClick={openAppointmentVipNormMonitoringPanel}
            >
              Norm Monitoring
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
            aria-expanded={openSubmenus.assignments ? "true" : "false"}
            onClick={() => {
              toggleSubmenu("assignments");
            }}
          >
            Assignments
          </button>
          <div id="assignmentsSubMenu" className="side-submenu" hidden={!openSubmenus.assignments || !canOpenAppointmentVipAssignments}>
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
              aria-expanded={openSubmenus.appointments ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("appointments");
              }}
            >
              Appointments
            </button>
            <div id="appointmentsSubMenu" className="side-submenu" hidden={!openSubmenus.appointments}>
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
                id="openAppointmentSpecialistAbsencesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentSpecialistAbsences}
                onClick={openAppointmentSpecialistAbsencesPanel}
              >
                Specialist Absences
              </button>
              <button
                id="openAppointmentUserWeeklyOverridesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenAppointmentWorkSchedule}
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
              aria-expanded={openSubmenus.statistics ? "true" : "false"}
              onClick={() => {
                toggleSubmenu("statistics");
              }}
            >
              Statistics
            </button>
            <div id="statisticsSubMenu" className="side-submenu" hidden={!openSubmenus.statistics}>
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
                id="openPositionsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenSettingsPositions}
                onClick={openPositionsPanel}
              >
                Positions
              </button>
              <button
                id="openAppointmentNormsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canOpenSettingsNorms}
                onClick={openNormsPanel}
              >
                Appointment Norms
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <div id="menuOverlay" className={`menu-overlay${menuState === "closing" ? " closing" : ""}`} hidden={menuState === "closed"} onClick={closeMenu} />
    </>
  );
});

export default ProfileSideMenu;
