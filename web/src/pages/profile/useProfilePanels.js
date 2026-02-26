import { useCallback } from "react";

export function useProfilePanels({
  navigate,
  mainView,
  closeMenu,
  closeUserDropdown,
  setMyProfileModalOpen,
  canCreateUsers,
  canReadClients,
  canCreateClients,
  canOpenAppointmentSchedule,
  canOpenAppointmentBreaks,
  canOpenAppointmentVipClients,
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

  const openCreateClientPanel = useCallback(() => {
    openPanel("/clients/create", canCreateClients);
  }, [canCreateClients, openPanel]);

  const closeCreateClientPanel = useCallback(() => {
    closePanel("clients-create");
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

  const openAppointmentVipClientsPanel = useCallback(() => {
    openPanel("/appointments/vip-clients", canOpenAppointmentVipClients);
  }, [canOpenAppointmentVipClients, openPanel]);

  const closeAppointmentVipClientsPanel = useCallback(() => {
    closePanel("appointment-vip-clients");
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

  const closeCreateUserPanel = useCallback(() => {
    closePanel("create-user");
  }, [closePanel]);

  const closeAllUsersPanel = useCallback(() => {
    closePanel("all-users");
  }, [closePanel]);

  return {
    openMyProfilePanel,
    closeMyProfilePanel,
    openCreateUserPanel,
    openAllClientsPanel,
    closeAllClientsPanel,
    openCreateClientPanel,
    closeCreateClientPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentBreaksPanel,
    closeAppointmentBreaksPanel,
    openAppointmentSettingsPanel,
    closeAppointmentSettingsPanel,
    openAppointmentVipClientsPanel,
    closeAppointmentVipClientsPanel,
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
    closeCreateUserPanel,
    closeAllUsersPanel
  };
}
