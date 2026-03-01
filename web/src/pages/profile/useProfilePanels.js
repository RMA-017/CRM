import { useCallback } from "react";

export function useProfilePanels({
  navigate,
  mainView,
  closeMenu,
  closeUserDropdown,
  setMyProfileModalOpen,
  canCreateUsers,
  canReadClients,
  canOpenAppointmentSchedule,
  canOpenAppointmentBreaks,
  canOpenAppointmentVipClients,
  canOpenMyChildren,
  canOpenAppointmentVipAssignments,
  canOpenAppointmentStatistics,
  hasSettingsMenuAccess,
  hasNotificationsSettingsAccess
}) {
  const openPanel = useCallback((path, hasAccess = true) => {
    closeMenu();
    closeUserDropdown();
    if (!hasAccess) {
      return;
    }
    navigate(path);
  }, [closeMenu, closeUserDropdown, navigate]);

  const closePanel = useCallback((view) => {
    if (mainView === view) {
      navigate("/profile");
    }
  }, [mainView, navigate]);

  const openMyProfilePanel = useCallback(() => {
    closeMenu();
    closeUserDropdown();
    setMyProfileModalOpen(true);
  }, [closeMenu, closeUserDropdown, setMyProfileModalOpen]);

  const closeMyProfilePanel = useCallback(() => {
    setMyProfileModalOpen(false);
  }, [setMyProfileModalOpen]);

  const openCreateUserPanel = useCallback(() => {
    openPanel("/users/create", canCreateUsers);
  }, [canCreateUsers, openPanel]);

  const openAllClientsPanel = useCallback(() => {
    openPanel("/clients/allclients", canReadClients);
  }, [canReadClients, openPanel]);

  const closeAllClientsPanel = useCallback(() => {
    closePanel("clients-all");
  }, [closePanel]);

  const openAppointmentPanel = useCallback(() => {
    openPanel("/appointments", canOpenAppointmentSchedule);
  }, [canOpenAppointmentSchedule, openPanel]);

  const closeAppointmentPanel = useCallback(() => {
    closePanel("appointment");
  }, [closePanel]);

  const openAppointmentBreaksPanel = useCallback(() => {
    openPanel("/appointments/breaks", canOpenAppointmentBreaks);
  }, [canOpenAppointmentBreaks, openPanel]);

  const closeAppointmentBreaksPanel = useCallback(() => {
    closePanel("appointment-breaks");
  }, [closePanel]);

  const openAppointmentSettingsPanel = useCallback(() => {
    openPanel("/appointments/settings", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closeAppointmentSettingsPanel = useCallback(() => {
    closePanel("appointment-settings");
  }, [closePanel]);

  const openStatisticsClassPanel = useCallback(() => {
    openPanel("/statistics/class", canOpenAppointmentStatistics);
  }, [canOpenAppointmentStatistics, openPanel]);

  const closeStatisticsPanel = useCallback(() => {
    if (mainView === "statistics" || mainView === "statistics-class") {
      navigate("/profile");
      return;
    }
    closePanel("statistics-class");
  }, [closePanel, mainView, navigate]);

  const openAppointmentVipAttendancePanel = useCallback(() => {
    openPanel("/appointments/vip-attendance", canOpenAppointmentVipClients);
  }, [canOpenAppointmentVipClients, openPanel]);

  const closeAppointmentVipAttendancePanel = useCallback(() => {
    if (mainView === "appointment-vip-attendance" || mainView === "appointment-vip-my-children") {
      navigate("/profile");
      return;
    }
    closePanel("appointment-vip-attendance");
  }, [closePanel, mainView, navigate]);

  const openAppointmentVipMyChildrenPanel = useCallback(() => {
    openPanel("/appointments/vip-my-children", canOpenMyChildren);
  }, [canOpenMyChildren, openPanel]);

  const closeAppointmentVipMyChildrenPanel = useCallback(() => {
    closeAppointmentVipAttendancePanel();
  }, [closeAppointmentVipAttendancePanel]);

  const openAppointmentVipDailyRoutinesPanel = useCallback(() => {
    openPanel("/appointments/vip-daily-routines", canOpenAppointmentVipClients);
  }, [canOpenAppointmentVipClients, openPanel]);

  const closeAppointmentVipDailyRoutinesPanel = useCallback(() => {
    closePanel("appointment-vip-daily-routines");
  }, [closePanel]);

  const openAppointmentVipAssignmentsPanel = useCallback(() => {
    openPanel("/appointments/vip-assignments", canOpenAppointmentVipAssignments);
  }, [canOpenAppointmentVipAssignments, openPanel]);

  const closeAppointmentVipAssignmentsPanel = useCallback(() => {
    closePanel("appointment-vip-assignments");
  }, [closePanel]);

  const openAppointmentVipTutorAssignmentsPanel = useCallback(() => {
    openPanel("/appointments/vip-tutor-assignments", canOpenAppointmentVipAssignments);
  }, [canOpenAppointmentVipAssignments, openPanel]);

  const closeAppointmentVipTutorAssignmentsPanel = useCallback(() => {
    closePanel("appointment-vip-tutor-assignments");
  }, [closePanel]);

  const openAppointmentVipSchedulePanel = useCallback(() => {
    openPanel("/appointments/vip-schedule", canOpenAppointmentSchedule);
  }, [canOpenAppointmentSchedule, openPanel]);

  const closeAppointmentVipSchedulePanel = useCallback(() => {
    closePanel("appointment-vip-schedule");
  }, [closePanel]);

  const openOrganizationsPanel = useCallback(() => {
    openPanel("/settings/organizations", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closeOrganizationsPanel = useCallback(() => {
    closePanel("settings-organizations");
  }, [closePanel]);

  const openRolesPanel = useCallback(() => {
    openPanel("/settings/roles", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closeRolesPanel = useCallback(() => {
    closePanel("settings-roles");
  }, [closePanel]);

  const openPositionsPanel = useCallback(() => {
    openPanel("/settings/positions", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closePositionsPanel = useCallback(() => {
    closePanel("settings-positions");
  }, [closePanel]);

  const openAdminOptionsPanel = useCallback(() => {
    openPanel("/settings/admin-options", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closeAdminOptionsPanel = useCallback(() => {
    closePanel("settings-admin-options");
  }, [closePanel]);

  const openNotificationsSettingsPanel = useCallback(() => {
    openPanel("/settings/notifications", hasNotificationsSettingsAccess);
  }, [hasNotificationsSettingsAccess, openPanel]);

  const closeNotificationsSettingsPanel = useCallback(() => {
    closePanel("settings-notifications");
  }, [closePanel]);

  const openMonitoringPanel = useCallback(() => {
    openPanel("/settings/monitoring", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closeMonitoringPanel = useCallback(() => {
    closePanel("settings-monitoring");
  }, [closePanel]);

  const closeCreateUserPanel = useCallback(() => {
    if (mainView === "create-user") {
      navigate("/users/allusers");
      return;
    }
    closePanel("create-user");
  }, [closePanel, mainView, navigate]);

  const closeAllUsersPanel = useCallback(() => {
    closePanel("all-users");
  }, [closePanel]);

  return {
    openMyProfilePanel,
    closeMyProfilePanel,
    openCreateUserPanel,
    openAllClientsPanel,
    closeAllClientsPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentBreaksPanel,
    closeAppointmentBreaksPanel,
    openAppointmentSettingsPanel,
    closeAppointmentSettingsPanel,
    openStatisticsClassPanel,
    closeStatisticsPanel,
    openAppointmentVipAttendancePanel,
    closeAppointmentVipAttendancePanel,
    openAppointmentVipMyChildrenPanel,
    closeAppointmentVipMyChildrenPanel,
    openAppointmentVipDailyRoutinesPanel,
    closeAppointmentVipDailyRoutinesPanel,
    openAppointmentVipAssignmentsPanel,
    closeAppointmentVipAssignmentsPanel,
    openAppointmentVipTutorAssignmentsPanel,
    closeAppointmentVipTutorAssignmentsPanel,
    openAppointmentVipSchedulePanel,
    closeAppointmentVipSchedulePanel,
    openOrganizationsPanel,
    closeOrganizationsPanel,
    openRolesPanel,
    closeRolesPanel,
    openPositionsPanel,
    closePositionsPanel,
    openAdminOptionsPanel,
    closeAdminOptionsPanel,
    openNotificationsSettingsPanel,
    closeNotificationsSettingsPanel,
    openMonitoringPanel,
    closeMonitoringPanel,
    closeCreateUserPanel,
    closeAllUsersPanel
  };
}
