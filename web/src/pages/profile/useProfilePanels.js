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
  canOpenAppointmentVipMyClass,
  canOpenAppointmentBreaks,
  canOpenAppointmentVipClients,
  canOpenMyChildren,
  canOpenAppointmentVipDailyRoutines,
  canOpenAppointmentVipAssignments,
  canOpenAppointmentStatistics,
  hasSettingsMenuAccess,
  hasAdminSettingsAccess,
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
    openPanel("/appointments/planner", canOpenAppointmentSchedule);
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
    openPanel("/settings/appointments", hasSettingsMenuAccess);
  }, [hasSettingsMenuAccess, openPanel]);

  const closeAppointmentSettingsPanel = useCallback(() => {
    closePanel("appointment-settings");
  }, [closePanel]);

  const openStatisticsClassPanel = useCallback(() => {
    openPanel("/statistics/vip-class-attendance-report", canOpenAppointmentStatistics);
  }, [canOpenAppointmentStatistics, openPanel]);

  const openStatisticsPlannerReportPanel = useCallback(() => {
    openPanel("/statistics/planner-report", canOpenAppointmentStatistics);
  }, [canOpenAppointmentStatistics, openPanel]);

  const closeStatisticsPanel = useCallback(() => {
    if (
      mainView === "statistics"
      || mainView === "statistics-class"
      || mainView === "statistics-planner-report"
    ) {
      navigate("/profile");
      return;
    }
    closePanel("statistics-class");
  }, [closePanel, mainView, navigate]);

  const openAppointmentVipAttendancePanel = useCallback(() => {
    openPanel("/vip-clients/attendance", canOpenAppointmentVipClients);
  }, [canOpenAppointmentVipClients, openPanel]);

  const closeAppointmentVipAttendancePanel = useCallback(() => {
    if (mainView === "appointment-vip-attendance" || mainView === "appointment-vip-my-children") {
      navigate("/profile");
      return;
    }
    closePanel("appointment-vip-attendance");
  }, [closePanel, mainView, navigate]);

  const openAppointmentVipMyChildrenPanel = useCallback(() => {
    openPanel("/vip-clients/my-children", canOpenMyChildren);
  }, [canOpenMyChildren, openPanel]);

  const closeAppointmentVipMyChildrenPanel = useCallback(() => {
    closeAppointmentVipAttendancePanel();
  }, [closeAppointmentVipAttendancePanel]);

  const openAppointmentVipDailyRoutinesPanel = useCallback(() => {
    openPanel("/vip-clients/daily-routines", canOpenAppointmentVipDailyRoutines);
  }, [canOpenAppointmentVipDailyRoutines, openPanel]);

  const closeAppointmentVipDailyRoutinesPanel = useCallback(() => {
    closePanel("appointment-vip-daily-routines");
  }, [closePanel]);

  const openAppointmentVipAssignmentsPanel = useCallback(() => {
    openPanel("/assignments/class", canOpenAppointmentVipAssignments);
  }, [canOpenAppointmentVipAssignments, openPanel]);

  const closeAppointmentVipAssignmentsPanel = useCallback(() => {
    closePanel("appointment-vip-assignments");
  }, [closePanel]);

  const openAppointmentVipTutorAssignmentsPanel = useCallback(() => {
    openPanel("/assignments/tutor", canOpenAppointmentVipAssignments);
  }, [canOpenAppointmentVipAssignments, openPanel]);

  const closeAppointmentVipTutorAssignmentsPanel = useCallback(() => {
    closePanel("appointment-vip-tutor-assignments");
  }, [closePanel]);

  const openAppointmentVipSchedulePanel = useCallback(() => {
    openPanel("/vip-clients/my-class", canOpenAppointmentVipMyClass);
  }, [canOpenAppointmentVipMyClass, openPanel]);

  const closeAppointmentVipSchedulePanel = useCallback(() => {
    closePanel("appointment-vip-schedule");
  }, [closePanel]);

  const openOrganizationsPanel = useCallback(() => {
    openPanel("/admin-settings/organizations", hasAdminSettingsAccess);
  }, [hasAdminSettingsAccess, openPanel]);

  const closeOrganizationsPanel = useCallback(() => {
    closePanel("settings-organizations");
  }, [closePanel]);

  const openRolesPanel = useCallback(() => {
    openPanel("/settings/roles", hasSettingsMenuAccess || hasAdminSettingsAccess);
  }, [hasAdminSettingsAccess, hasSettingsMenuAccess, openPanel]);

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
    openPanel("/admin-settings/monitoring", hasAdminSettingsAccess);
  }, [hasAdminSettingsAccess, openPanel]);

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
    openStatisticsPlannerReportPanel,
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
