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
  const canReadAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_READ);
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
    if (forcedView === "clients") {
      return canReadClients;
    }
    if (forcedView === "appointment") {
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
    canReadAppointments,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    canAccessForcedView
  };
}
