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

  // Org-level feature flags — null means all features enabled (platform admin or legacy)
  const orgFeatureSet = useMemo(() => {
    if (Boolean(profile?.isPlatformAdmin)) {
      return null; // platform admin always sees everything
    }
    if (!Array.isArray(profile?.orgFeatures)) {
      return null; // null = all features enabled
    }
    return new Set(profile.orgFeatures);
  }, [profile?.isPlatformAdmin, profile?.orgFeatures]);

  const hasOrgFeature = (feature) => {
    if (orgFeatureSet === null) return true;
    if (orgFeatureSet.has(feature)) return true;
    const dot = feature.indexOf(".");
    if (dot !== -1 && orgFeatureSet.has(feature.slice(0, dot))) return true;
    return false;
  };

  const canReadUsers = permissionSet.has(PERMISSIONS.USERS_READ) && hasOrgFeature("users");
  const canCreateUsers = permissionSet.has(PERMISSIONS.USERS_CREATE) && hasOrgFeature("users");
  const canUpdateUsers = permissionSet.has(PERMISSIONS.USERS_UPDATE) && hasOrgFeature("users");
  const canDeleteUsers = permissionSet.has(PERMISSIONS.USERS_DELETE) && hasOrgFeature("users");
  const canReadClients = permissionSet.has(PERMISSIONS.CLIENTS_READ) && hasOrgFeature("clients");
  const canCreateClients = permissionSet.has(PERMISSIONS.CLIENTS_CREATE) && hasOrgFeature("clients");
  const canUpdateClients = permissionSet.has(PERMISSIONS.CLIENTS_UPDATE) && hasOrgFeature("clients");
  const canDeleteClients = permissionSet.has(PERMISSIONS.CLIENTS_DELETE) && hasOrgFeature("clients");
  const canReadAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_READ) && hasOrgFeature("appointments");
  const canCreateAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_CREATE) && hasOrgFeature("appointments");
  const canUpdateAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_UPDATE) && hasOrgFeature("appointments");
  const canDeleteAppointments = permissionSet.has(PERMISSIONS.APPOINTMENTS_DELETE) && hasOrgFeature("appointments");
  const canReadVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ) && hasOrgFeature("vip_clients");
  const canCreateVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE) && hasOrgFeature("vip_clients");
  const canUpdateVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE) && hasOrgFeature("vip_clients");
  const canDeleteVipClientsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE) && hasOrgFeature("vip_clients");
  const canMyClassPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS) && hasOrgFeature("vip_clients");
  const canMyChildrenPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN) && hasOrgFeature("vip_clients");
  const canDailyRoutinesPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES) && hasOrgFeature("vip_clients");
  const canReadAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_READ) && hasOrgFeature("assignments");
  const canCreateAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CREATE) && hasOrgFeature("assignments");
  const canUpdateAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_UPDATE) && hasOrgFeature("assignments");
  const canDeleteAssignmentsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_DELETE) && hasOrgFeature("assignments");
  const canReadStatisticsPermission = permissionSet.has(PERMISSIONS.APPOINTMENTS_STATISTICS_READ) && hasOrgFeature("statistics");
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

  const canOpenAppointmentSchedule = canReadAppointments && hasOrgFeature("appointments.planner") && (
    usesAdvancedMenuPermissions
      ? permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE)
      : true
  );
  const canOpenAppointmentBreaks = canReadAppointments && hasOrgFeature("appointments.breaks") && (
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
  const canOpenAppointmentVipClients = hasOrgFeature("vip_clients.attendance") && (
    usesAdvancedMenuPermissions
      ? canReadVipClientsPermission
      : canReadClients
  );
  const canOpenAppointmentVipMyClass = hasOrgFeature("vip_clients.my_class") && (
    usesAdvancedMenuPermissions
      ? (canReadAppointments && (canMyClassPermission || permissionSet.has(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE)))
      : canOpenAppointmentSchedule
  );
  const canOpenMyChildren = hasOrgFeature("vip_clients.my_children") && (
    usesAdvancedMenuPermissions
      ? (canMyChildrenPermission || canOpenAppointmentVipClients)
      : canReadClients
  );
  const canOpenAppointmentVipDailyRoutines = hasOrgFeature("vip_clients.daily_routines") && (
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
  const canOpenAppointmentVipClassAssignments = hasOrgFeature("assignments.class") && (
    usesAdvancedMenuPermissions
      ? canReadAssignmentsPermission
      : legacyCanReadAssignments
  );
  const canOpenAppointmentVipTutorAssignments = hasOrgFeature("assignments.tutor") && (
    usesAdvancedMenuPermissions
      ? canReadAssignmentsPermission
      : legacyCanReadAssignments
  );
  const canOpenAppointmentVipAssignments = canOpenAppointmentVipClassAssignments || canOpenAppointmentVipTutorAssignments;
  const canOpenAppointmentStatistics = canReadAppointments
    && canReadClients
    && (
      usesAdvancedMenuPermissions
        ? canReadStatisticsPermission
        : canOpenAppointmentVipClients
    );
  const canOpenStatisticsClassAttendance = canOpenAppointmentStatistics && hasOrgFeature("statistics.class_attendance");
  const canOpenStatisticsPlannerReport = canOpenAppointmentStatistics && hasOrgFeature("statistics.planner_report");

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
      return canOpenAppointmentVipClassAssignments;
    }
    if (forcedView === "appointment-vip-tutor-assignments") {
      return canOpenAppointmentVipTutorAssignments;
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
    if (forcedView === "appointment-work-schedule") {
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
    if (forcedView === "statistics") {
      return canOpenAppointmentStatistics;
    }
    if (forcedView === "statistics-class") {
      return canOpenStatisticsClassAttendance;
    }
    if (forcedView === "statistics-planner-report") {
      return canOpenStatisticsPlannerReport;
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
    canOpenAppointmentVipClassAssignments,
    canOpenAppointmentVipTutorAssignments,
    canOpenAppointmentVipAssignments,
    canReadAppointmentVipAssignments,
    canCreateAppointmentVipAssignments,
    canUpdateAppointmentVipAssignments,
    canDeleteAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    canOpenStatisticsClassAttendance,
    canOpenStatisticsPlannerReport,
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
    canOpenAppointmentVipClassAssignments,
    canOpenAppointmentVipTutorAssignments,
    canOpenAppointmentVipAssignments,
    canReadAppointmentVipAssignments,
    canCreateAppointmentVipAssignments,
    canUpdateAppointmentVipAssignments,
    canDeleteAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    canOpenStatisticsClassAttendance,
    canOpenStatisticsPlannerReport,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    hasNotificationsSettingsAccess,
    canAccessForcedView
  };
}
