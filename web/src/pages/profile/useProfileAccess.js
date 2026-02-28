import { useMemo } from "react";
import { PERMISSIONS } from "../../constants/permissions.js";

export function useProfileAccess(profile, forcedView) {
  const permissionSet = useMemo(() => {
    if (!Array.isArray(profile?.permissions)) {
      return new Set();
    }
    return new Set(
      profile.permissions
        .map((permission) => String(permission || "").trim().toLowerCase())
        .filter(Boolean)
    );
  }, [profile?.permissions]);

  const canReadUsers = permissionSet.has(PERMISSIONS.USERS_READ);
  const canCreateUsers = permissionSet.has(PERMISSIONS.USERS_CREATE);
  const canUpdateUsers = permissionSet.has(PERMISSIONS.USERS_UPDATE);
  const canDeleteUsers = permissionSet.has(PERMISSIONS.USERS_DELETE);
  const canReadClients = permissionSet.has(PERMISSIONS.CLIENTS_READ);
  const canCreateClients = permissionSet.has(PERMISSIONS.CLIENTS_CREATE);
  const canUpdateClients = permissionSet.has(PERMISSIONS.CLIENTS_UPDATE);
  const canDeleteClients = permissionSet.has(PERMISSIONS.CLIENTS_DELETE);
  const canReadAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_READ);
  const canCreateAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_CREATE);
  const canUpdateAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_UPDATE);
  const canDeleteAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_DELETE);
  const canSendNotifications = permissionSet.has(PERMISSIONS.NOTIFICATIONS_SEND);
  const canSearchAppointmentClients = (
    permissionSet.has(PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH)
    || canReadClients
  );

  const usesAdvancedMenuPermissions = (
    permissionSet.has(PERMISSIONS.CLIENTS_MENU)
    || permissionSet.has(PERMISSIONS.APPOINTMENTS_MENU)
    || permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE)
    || permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS)
    || permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_VIP_CLIENTS)
  );

  const canOpenClientsMenu = usesAdvancedMenuPermissions
    ? permissionSet.has(PERMISSIONS.CLIENTS_MENU)
    : (canReadClients || canCreateClients);
  const hasClientsMenuAccess = canOpenClientsMenu && (canReadClients || canCreateClients);

  const canOpenAppointmentSchedule = canReadAppointments && (
    usesAdvancedMenuPermissions
      ? permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE)
      : true
  );
  const canOpenAppointmentBreaks = canReadAppointments && (
    usesAdvancedMenuPermissions
      ? permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS)
      : true
  );
  const canOpenAppointmentVipClients = canReadAppointments && canReadClients && (
    usesAdvancedMenuPermissions
      ? permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_VIP_CLIENTS)
      : true
  );

  const canOpenAppointmentsMenu = usesAdvancedMenuPermissions
    ? permissionSet.has(PERMISSIONS.APPOINTMENTS_MENU)
    : canReadAppointments;
  const hasAppointmentsMenuAccess = canOpenAppointmentsMenu
    && (canOpenAppointmentSchedule || canOpenAppointmentBreaks || canOpenAppointmentVipClients);
  const hasUsersMenuAccess = canReadUsers || canCreateUsers;
  const hasSettingsMenuAccess = Boolean(profile?.isAdmin);
  const hasNotificationsSettingsAccess = hasSettingsMenuAccess || canSendNotifications;

  const canAccessForcedView = useMemo(() => {
    if (forcedView === "none") {
      return true;
    }
    if (forcedView === "all-users") {
      return canReadUsers;
    }
    if (forcedView === "create-user") {
      return canCreateUsers;
    }
    if (forcedView === "clients" || forcedView === "clients-all") {
      return hasClientsMenuAccess && canReadClients;
    }
    if (forcedView === "clients-create") {
      return hasClientsMenuAccess && canCreateClients;
    }
    if (forcedView === "appointment-vip-clients") {
      return canOpenAppointmentVipClients;
    }
    if (forcedView === "appointment-vip-schedule") {
      return canOpenAppointmentSchedule;
    }
    if (forcedView === "appointment") {
      return canOpenAppointmentSchedule;
    }
    if (forcedView === "appointment-breaks") {
      return canOpenAppointmentBreaks;
    }
    if (forcedView === "appointment-settings") {
      return hasSettingsMenuAccess;
    }
    if (
      forcedView === "settings-organizations"
      || forcedView === "settings-roles"
      || forcedView === "settings-positions"
      || forcedView === "settings-admin-options"
    ) {
      return hasSettingsMenuAccess;
    }
    if (forcedView === "settings-notifications") {
      return hasNotificationsSettingsAccess;
    }
    return true;
  }, [
    canCreateUsers,
    canReadAppointments,
    canReadClients,
    canCreateClients,
    canOpenAppointmentBreaks,
    canOpenAppointmentSchedule,
    canOpenAppointmentVipClients,
    hasClientsMenuAccess,
    canReadUsers,
    forcedView,
    hasNotificationsSettingsAccess,
    hasSettingsMenuAccess
  ]);

  return {
    canReadUsers,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canReadClients,
    canCreateClients,
    canUpdateClients,
    canDeleteClients,
    canSearchAppointmentClients,
    hasClientsMenuAccess,
    canReadAppointments,
    canCreateAppointments,
    canUpdateAppointments,
    canDeleteAppointments,
    canSendNotifications,
    canOpenAppointmentSchedule,
    canOpenAppointmentBreaks,
    canOpenAppointmentVipClients,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasNotificationsSettingsAccess,
    canAccessForcedView
  };
}
