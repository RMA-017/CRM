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
  const canReadVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ);
  const canCreateVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE);
  const canUpdateVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE);
  const canDeleteVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE);
  const canMyClassPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS);
  const canMyChildrenPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN);
  const canDailyRoutinesPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES);
  const canReadAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_READ);
  const canCreateAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CREATE);
  const canUpdateAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_UPDATE);
  const canDeleteAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_DELETE);
  const canReadStatisticsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_STATISTICS_READ);
  const canSendNotifications = permissionSet.has(PERMISSIONS.NOTIFICATIONS_SEND);
  const canSearchAppointmentClients = (
    permissionSet.has(PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH)
    || canReadClients
  );

  const usesAdvancedMenuPermissions = (
    permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE)
    || permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS)
    || canReadVipClientsPermission
    || canCreateVipClientsPermission
    || canUpdateVipClientsPermission
    || canDeleteVipClientsPermission
    || canMyClassPermission
    || canMyChildrenPermission
    || canDailyRoutinesPermission
    || canReadAssignmentsPermission
    || canCreateAssignmentsPermission
    || canUpdateAssignmentsPermission
    || canDeleteAssignmentsPermission
    || canReadStatisticsPermission
  );

  const hasClientsMenuAccess = canReadClients;

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
  const rolePositionText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isDirectorLike = rolePositionText.includes("director") || rolePositionText.includes("direktor");
  const canReadAppointmentVipClients = (
    usesAdvancedMenuPermissions
      ? canReadVipClientsPermission
      : canReadClients
  );
  const canCreateAppointmentVipClients = (
    usesAdvancedMenuPermissions
      ? canCreateVipClientsPermission
      : canReadClients
  );
  const canUpdateAppointmentVipClients = (
    usesAdvancedMenuPermissions
      ? canUpdateVipClientsPermission
      : canReadClients
  );
  const canDeleteAppointmentVipClients = (
    usesAdvancedMenuPermissions
      ? canDeleteVipClientsPermission
      : canReadClients
  );
  const canOpenAppointmentVipClients = (
    usesAdvancedMenuPermissions
      ? canReadVipClientsPermission
      : canReadClients
  );
  const canOpenAppointmentVipMyClass = (
    usesAdvancedMenuPermissions
      ? (canReadAppointments && (canMyClassPermission || permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE)))
      : canOpenAppointmentSchedule
  );
  const canOpenMyChildren = (
    usesAdvancedMenuPermissions
      ? (canMyChildrenPermission || canOpenAppointmentVipClients)
      : canReadClients
  );
  const canOpenAppointmentVipDailyRoutines = (
    usesAdvancedMenuPermissions
      ? (canDailyRoutinesPermission && canReadVipClientsPermission)
      : canReadClients
  );

  const legacyCanReadAssignments = canReadClients && (Boolean(profile?.isAdmin) || isDirectorLike);
  const legacyCanManageAssignments = canUpdateClients && (Boolean(profile?.isAdmin) || isDirectorLike);
  const canReadAppointmentVipAssignments = usesAdvancedMenuPermissions
    ? canReadAssignmentsPermission
    : legacyCanReadAssignments;
  const canCreateAppointmentVipAssignments = usesAdvancedMenuPermissions
    ? canCreateAssignmentsPermission
    : legacyCanManageAssignments;
  const canUpdateAppointmentVipAssignments = usesAdvancedMenuPermissions
    ? canUpdateAssignmentsPermission
    : legacyCanManageAssignments;
  const canDeleteAppointmentVipAssignments = usesAdvancedMenuPermissions
    ? canDeleteAssignmentsPermission
    : legacyCanManageAssignments;
  const canOpenAppointmentVipAssignments = (
    usesAdvancedMenuPermissions
      ? canReadAssignmentsPermission
      : legacyCanReadAssignments
  );
  const canOpenAppointmentStatistics = canReadAppointments
    && canReadClients
    && (
      usesAdvancedMenuPermissions
        ? canReadStatisticsPermission
        : canOpenAppointmentVipClients
    );

  const hasAppointmentsMenuAccess = canReadAppointments
    && (canOpenAppointmentSchedule || canOpenAppointmentBreaks || canOpenAppointmentVipClients);
  const hasUsersMenuAccess = canReadUsers || canCreateUsers;
  const hasSettingsMenuAccess = Boolean(profile?.isAdmin);
  const hasAdminSettingsAccess = Boolean(profile?.isPlatformAdmin);
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
    if (forcedView === "appointment-vip-attendance") {
      return canOpenAppointmentVipClients;
    }
    if (forcedView === "appointment-vip-my-children") {
      return canOpenMyChildren;
    }
    if (forcedView === "appointment-vip-daily-routines") {
      return canOpenAppointmentVipDailyRoutines;
    }
    if (forcedView === "appointment-vip-assignments") {
      return canOpenAppointmentVipAssignments;
    }
    if (forcedView === "appointment-vip-tutor-assignments") {
      return canOpenAppointmentVipAssignments;
    }
    if (forcedView === "appointment-vip-schedule") {
      return canOpenAppointmentVipMyClass;
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
    if (forcedView === "settings-organizations" || forcedView === "settings-monitoring") {
      return hasAdminSettingsAccess;
    }
    if (forcedView === "settings-roles") {
      return hasSettingsMenuAccess || hasAdminSettingsAccess;
    }
    if (
      forcedView === "settings-positions"
      || forcedView === "settings-admin-options"
    ) {
      return hasSettingsMenuAccess;
    }
    if (forcedView === "settings-notifications") {
      return hasNotificationsSettingsAccess;
    }
    if (
      forcedView === "statistics"
      || forcedView === "statistics-class"
      || forcedView === "statistics-planner-report"
    ) {
      return canOpenAppointmentStatistics;
    }
    return true;
  }, [
    canCreateUsers,
    canCreateClients,
    canOpenAppointmentBreaks,
    canOpenAppointmentSchedule,
    canOpenAppointmentVipMyClass,
    canOpenAppointmentVipClients,
    canOpenMyChildren,
    canOpenAppointmentVipDailyRoutines,
    canReadAppointmentVipClients,
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    canOpenAppointmentVipAssignments,
    canReadAppointmentVipAssignments,
    canCreateAppointmentVipAssignments,
    canUpdateAppointmentVipAssignments,
    canDeleteAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    canReadStatisticsPermission,
    hasClientsMenuAccess,
    canReadUsers,
    forcedView,
    hasAdminSettingsAccess,
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
    canOpenAppointmentVipMyClass,
    canOpenAppointmentBreaks,
    canOpenAppointmentVipClients,
    canOpenMyChildren,
    canOpenAppointmentVipDailyRoutines,
    canReadAppointmentVipClients,
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    canOpenAppointmentVipAssignments,
    canReadAppointmentVipAssignments,
    canCreateAppointmentVipAssignments,
    canUpdateAppointmentVipAssignments,
    canDeleteAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    hasNotificationsSettingsAccess,
    canAccessForcedView
  };
}
