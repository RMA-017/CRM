import { useCallback } from "react";

export function useProfilePanels({
  navigate,
  mainView,
  closeMenu,
  closeUserDropdown,
  setMyProfileModalOpen,
  canCreateUsers,
  canReadClients,
  canOpenCrm,
  canOpenServices,
  canOpenAppointmentSchedule,
  canOpenAppointmentStatistics,
  canOpenAppointmentSettings,
  canOpenTelegramBotSettings,
  canOpenSmsNotifications,
  canOpenSettingsOrganizations,
  canOpenSettingsRoles,
  canOpenSettingsPositions,
  canOpenSettingsServices,
  canOpenSiteContent,
  hasAdminSettingsAccess
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

  const openCrmPanel = useCallback(() => {
    openPanel("/crm", canOpenCrm);
  }, [canOpenCrm, openPanel]);

  const closeCrmPanel = useCallback(() => {
    closePanel("crm");
  }, [closePanel]);

  const openServicesPanel = useCallback(() => {
    openPanel("/services", canOpenServices);
  }, [canOpenServices, openPanel]);

  const closeServicesPanel = useCallback(() => {
    closePanel("services");
  }, [closePanel]);

  const closeAllClientsPanel = useCallback(() => {
    closePanel("clients-all");
  }, [closePanel]);

  const openAppointmentPanel = useCallback(() => {
    openPanel("/appointments/planner", canOpenAppointmentSchedule);
  }, [canOpenAppointmentSchedule, openPanel]);

  const closeAppointmentPanel = useCallback(() => {
    closePanel("appointment");
  }, [closePanel]);

  const openAppointmentSettingsPanel = useCallback(() => {
    openPanel("/settings/appointments", canOpenAppointmentSettings);
  }, [canOpenAppointmentSettings, openPanel]);

  const closeAppointmentSettingsPanel = useCallback(() => {
    closePanel("appointment-settings");
  }, [closePanel]);

  const openTelegramBotSettingsPanel = useCallback(() => {
    openPanel("/settings/telegram-bot", canOpenTelegramBotSettings);
  }, [canOpenTelegramBotSettings, openPanel]);

  const closeTelegramBotSettingsPanel = useCallback(() => {
    closePanel("telegram-bot-settings");
  }, [closePanel]);

  const openSmsNotificationsPanel = useCallback(() => {
    openPanel("/sms-xabarnoma", canOpenSmsNotifications);
  }, [canOpenSmsNotifications, openPanel]);

  const closeSmsNotificationsPanel = useCallback(() => {
    closePanel("sms-notifications");
  }, [closePanel]);

  const openStatisticsPlannerReportPanel = useCallback(() => {
    openPanel("/statistics/planner-report", canOpenAppointmentStatistics);
  }, [canOpenAppointmentStatistics, openPanel]);

  const closeStatisticsPanel = useCallback(() => {
    if (mainView === "statistics" || mainView === "statistics-planner-report") {
      navigate("/profile");
      return;
    }
    closePanel("statistics-planner-report");
  }, [closePanel, mainView, navigate]);

  const openOrganizationsPanel = useCallback(() => {
    openPanel("/admin-settings/organizations", canOpenSettingsOrganizations);
  }, [canOpenSettingsOrganizations, openPanel]);

  const closeOrganizationsPanel = useCallback(() => {
    closePanel("settings-organizations");
  }, [closePanel]);

  const openRolesPanel = useCallback(() => {
    openPanel("/settings/roles", canOpenSettingsRoles);
  }, [canOpenSettingsRoles, openPanel]);

  const closeRolesPanel = useCallback(() => {
    closePanel("settings-roles");
  }, [closePanel]);

  const openPositionsPanel = useCallback(() => {
    openPanel("/settings/positions", canOpenSettingsPositions);
  }, [canOpenSettingsPositions, openPanel]);

  const closePositionsPanel = useCallback(() => {
    closePanel("settings-positions");
  }, [closePanel]);

  const openSettingsServicesPanel = useCallback(() => {
    openPanel("/settings/services", canOpenSettingsServices);
  }, [canOpenSettingsServices, openPanel]);

  const closeSettingsServicesPanel = useCallback(() => {
    closePanel("settings-services");
  }, [closePanel]);

  const openMonitoringPanel = useCallback(() => {
    openPanel("/admin-settings/monitoring", hasAdminSettingsAccess);
  }, [hasAdminSettingsAccess, openPanel]);

  const closeMonitoringPanel = useCallback(() => {
    closePanel("settings-monitoring");
  }, [closePanel]);

  const openSiteContentPanel = useCallback((sectionKey = "kids") => {
    const section = ["kids", "blog", "team", "partners"].includes(sectionKey) ? sectionKey : "kids";
    openPanel(`/site/content?section=${section}`, canOpenSiteContent);
  }, [canOpenSiteContent, openPanel]);

  const closeSiteContentPanel = useCallback(() => {
    closePanel("site-content");
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
    openCrmPanel,
    closeCrmPanel,
    openServicesPanel,
    closeServicesPanel,
    closeAllClientsPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentSettingsPanel,
    closeAppointmentSettingsPanel,
    openTelegramBotSettingsPanel,
    closeTelegramBotSettingsPanel,
    openSmsNotificationsPanel,
    closeSmsNotificationsPanel,
    openStatisticsPlannerReportPanel,
    closeStatisticsPanel,
    openOrganizationsPanel,
    closeOrganizationsPanel,
    openRolesPanel,
    closeRolesPanel,
    openPositionsPanel,
    closePositionsPanel,
    openSettingsServicesPanel,
    closeSettingsServicesPanel,
    openMonitoringPanel,
    closeMonitoringPanel,
    openSiteContentPanel,
    closeSiteContentPanel,
    closeCreateUserPanel,
    closeAllUsersPanel
  };
}
