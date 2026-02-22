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
  const hasClientsMenuAccess = canReadClients || canCreateClients;
  const hasAppointmentsMenuAccess = canReadAppointments;
  const hasUsersMenuAccess = canReadUsers || canCreateUsers;
  const hasSettingsMenuAccess = Boolean(profile?.isAdmin);

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
      return canReadClients;
    }
    if (forcedView === "clients-create") {
      return canCreateClients;
    }
    if (
      forcedView === "appointment"
      || forcedView === "appointment-settings"
      || forcedView === "appointment-vip-recurring"
    ) {
      return canReadAppointments;
    }
    if (
      forcedView === "settings-organizations"
      || forcedView === "settings-roles"
      || forcedView === "settings-positions"
    ) {
      return hasSettingsMenuAccess;
    }
    return true;
  }, [
    canCreateUsers,
    canReadAppointments,
    canReadClients,
    canCreateClients,
    canReadUsers,
    forcedView,
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
    hasClientsMenuAccess,
    canReadAppointments,
    canCreateAppointments,
    canUpdateAppointments,
    canDeleteAppointments,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    canAccessForcedView
  };
}
