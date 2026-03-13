import { useMemo } from "react";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  hasAllowedFeature,
  isPermissionAllowedByFeatures
} from "../../../../shared/access-registry.js";

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

  const normalizedOrgFeatures = orgFeatureSet === null ? null : Array.from(orgFeatureSet);
  const hasOrgFeature = (feature) => hasAllowedFeature(normalizedOrgFeatures, feature);
  const hasPermissionWithOrgFeature = (permissionCode) => (
    permissionSet.has(permissionCode)
    && isPermissionAllowedByFeatures(permissionCode, normalizedOrgFeatures)
  );
  const hasMedicalHistoryAdminFallback = (permissionCode) => (
    Boolean(profile?.isAdmin)
    && isPermissionAllowedByFeatures(permissionCode, normalizedOrgFeatures)
  );

  const canReadUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_READ);
  const canCreateUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_CREATE);
  const canUpdateUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_UPDATE);
  const canDeleteUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_DELETE);
  const canReadClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_READ);
  const canCreateClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_CREATE);
  const canUpdateClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_UPDATE);
  const canDeleteClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_DELETE);
  const canReadClientMedicalHistory = (
    hasPermissionWithOrgFeature(PERMISSIONS.CLIENT_MEDICAL_HISTORY_READ)
    || hasMedicalHistoryAdminFallback(PERMISSIONS.CLIENT_MEDICAL_HISTORY_READ)
  );
  const canCreateClientMedicalHistory = (
    hasPermissionWithOrgFeature(PERMISSIONS.CLIENT_MEDICAL_HISTORY_CREATE)
    || hasMedicalHistoryAdminFallback(PERMISSIONS.CLIENT_MEDICAL_HISTORY_CREATE)
  );
  const canUpdateClientMedicalHistory = (
    hasPermissionWithOrgFeature(PERMISSIONS.CLIENT_MEDICAL_HISTORY_UPDATE)
    || hasMedicalHistoryAdminFallback(PERMISSIONS.CLIENT_MEDICAL_HISTORY_UPDATE)
  );
  const canDeleteClientMedicalHistory = (
    hasPermissionWithOrgFeature(PERMISSIONS.CLIENT_MEDICAL_HISTORY_DELETE)
    || hasMedicalHistoryAdminFallback(PERMISSIONS.CLIENT_MEDICAL_HISTORY_DELETE)
  );
  const canReadAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_READ);
  const canCreateAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_CREATE);
  const canUpdateAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_UPDATE);
  const canDeleteAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_DELETE);
  const canReadVipClientsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ);
  const canCreateVipClientsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE);
  const canUpdateVipClientsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE);
  const canDeleteVipClientsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE);
  const canMyClassPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS);
  const canMyChildrenPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN);
  const canDailyRoutinesPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES);
  const canReadAssignmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_READ);
  const canCreateAssignmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CREATE);
  const canUpdateAssignmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_UPDATE);
  const canDeleteAssignmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_DELETE);
  const canReadStatisticsClassAttendancePermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_STATISTICS_CLASS_ATTENDANCE);
  const canReadStatisticsPlannerReportPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT);
  const canReadSettingsAppointmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_APPOINTMENTS_READ);
  const canUpdateSettingsAppointmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_APPOINTMENTS_UPDATE);
  const canReadSettingsAppointmentNormsPermission = hasPermissionWithOrgFeature(
    PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_READ
  );
  const canCreateSettingsAppointmentNormsPermission = hasPermissionWithOrgFeature(
    PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_CREATE
  );
  const canUpdateSettingsAppointmentNormsPermission = hasPermissionWithOrgFeature(
    PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_UPDATE
  );
  const canDeleteSettingsAppointmentNormsPermission = hasPermissionWithOrgFeature(
    PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_DELETE
  );
  const canReadSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_READ);
  const canCreateSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_CREATE);
  const canUpdateSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_UPDATE);
  const canDeleteSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_DELETE);
  const canReadSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_READ);
  const canCreateSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_CREATE);
  const canUpdateSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_UPDATE);
  const canDeleteSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_DELETE);
  const canSendNotifications = hasPermissionWithOrgFeature(PERMISSIONS.NOTIFICATIONS_SEND);
  const canOpenPlannerPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE);
  const canOpenBreaksPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS);
  const canOpenWorkSchedulePermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_SUBMENU_WORK_SCHEDULE);
  const canSearchAppointmentClientsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH);
  const canSearchAppointmentClients = (
    canSearchAppointmentClientsPermission
    || canReadClients
  );

  const usesAdvancedMenuPermissions = (
    canOpenPlannerPermission
    || canOpenBreaksPermission
    || canOpenWorkSchedulePermission
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
    || canReadStatisticsClassAttendancePermission
    || canReadStatisticsPlannerReportPermission
  );
  const hasClientsMenuAccess = canReadClients;
  const legacyHasSettingsAccess = Boolean(profile?.isAdmin || profile?.isPlatformAdmin);
  const hasExplicitAppointmentSettingsPermissions = (
    canReadSettingsAppointmentsPermission
    || canUpdateSettingsAppointmentsPermission
  );
  const hasExplicitAppointmentNormSettingsPermissions = (
    canReadSettingsAppointmentNormsPermission
    || canCreateSettingsAppointmentNormsPermission
    || canUpdateSettingsAppointmentNormsPermission
    || canDeleteSettingsAppointmentNormsPermission
  );
  const hasExplicitRoleSettingsPermissions = (
    canReadSettingsRolesPermission
    || canCreateSettingsRolesPermission
    || canUpdateSettingsRolesPermission
    || canDeleteSettingsRolesPermission
  );
  const hasExplicitPositionSettingsPermissions = (
    canReadSettingsPositionsPermission
    || canCreateSettingsPositionsPermission
    || canUpdateSettingsPositionsPermission
    || canDeleteSettingsPositionsPermission
  );
  const canReadSettingsAppointments = hasExplicitAppointmentSettingsPermissions
    ? canReadSettingsAppointmentsPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsAppointments = hasExplicitAppointmentSettingsPermissions
    ? canUpdateSettingsAppointmentsPermission
    : legacyHasSettingsAccess;
  const canReadSettingsAppointmentNorms = hasExplicitAppointmentNormSettingsPermissions
    ? canReadSettingsAppointmentNormsPermission
    : legacyHasSettingsAccess;
  const canCreateSettingsAppointmentNorms = hasExplicitAppointmentNormSettingsPermissions
    ? canCreateSettingsAppointmentNormsPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsAppointmentNorms = hasExplicitAppointmentNormSettingsPermissions
    ? canUpdateSettingsAppointmentNormsPermission
    : legacyHasSettingsAccess;
  const canDeleteSettingsAppointmentNorms = hasExplicitAppointmentNormSettingsPermissions
    ? canDeleteSettingsAppointmentNormsPermission
    : legacyHasSettingsAccess;
  const canReadSettingsOrganizations = Boolean(profile?.isPlatformAdmin);
  const canCreateSettingsOrganizations = Boolean(profile?.isPlatformAdmin);
  const canUpdateSettingsOrganizations = Boolean(profile?.isPlatformAdmin);
  const canDeleteSettingsOrganizations = Boolean(profile?.isPlatformAdmin);
  const canReadSettingsRoles = hasExplicitRoleSettingsPermissions
    ? canReadSettingsRolesPermission
    : legacyHasSettingsAccess;
  const canCreateSettingsRoles = hasExplicitRoleSettingsPermissions
    ? canCreateSettingsRolesPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsRoles = hasExplicitRoleSettingsPermissions
    ? canUpdateSettingsRolesPermission
    : legacyHasSettingsAccess;
  const canDeleteSettingsRoles = hasExplicitRoleSettingsPermissions
    ? canDeleteSettingsRolesPermission
    : legacyHasSettingsAccess;
  const canReadSettingsPositions = hasExplicitPositionSettingsPermissions
    ? canReadSettingsPositionsPermission
    : legacyHasSettingsAccess;
  const canCreateSettingsPositions = hasExplicitPositionSettingsPermissions
    ? canCreateSettingsPositionsPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsPositions = hasExplicitPositionSettingsPermissions
    ? canUpdateSettingsPositionsPermission
    : legacyHasSettingsAccess;
  const canDeleteSettingsPositions = hasExplicitPositionSettingsPermissions
    ? canDeleteSettingsPositionsPermission
    : legacyHasSettingsAccess;

  const canOpenAppointmentSchedule = canReadAppointments && hasOrgFeature("appointments.planner") && (
    usesAdvancedMenuPermissions
      ? canOpenPlannerPermission
      : true
  );
  const canOpenAppointmentBreaks = canReadAppointments && hasOrgFeature("appointments.breaks") && (
    usesAdvancedMenuPermissions
      ? canOpenBreaksPermission
      : true
  );
  const rolePositionText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isDirectorLike = rolePositionText.includes("director") || rolePositionText.includes("direktor");
  const canReadAppointmentVipClients = canReadVipClientsPermission;
  const canCreateAppointmentVipClients = canCreateVipClientsPermission;
  const canUpdateAppointmentVipClients = canUpdateVipClientsPermission;
  const canDeleteAppointmentVipClients = canDeleteVipClientsPermission;
  const canOpenAppointmentVipClients = hasOrgFeature("vip_clients.attendance") && canReadVipClientsPermission;
  const canOpenAppointmentVipMyClass = hasOrgFeature("vip_clients.my_class") && canMyClassPermission;
  const canOpenMyChildren = hasOrgFeature("vip_clients.my_children") && canMyChildrenPermission;
  const canOpenAppointmentVipDailyRoutines = (
    hasOrgFeature("vip_clients.daily_routines")
    && canDailyRoutinesPermission
    && canReadVipClientsPermission
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
        ? (canReadStatisticsClassAttendancePermission || canReadStatisticsPlannerReportPermission)
        : canOpenAppointmentVipClients
    );
  const canOpenStatisticsClassAttendance = canOpenAppointmentStatistics
    && hasOrgFeature("statistics.class_attendance")
    && (!usesAdvancedMenuPermissions || canReadStatisticsClassAttendancePermission);
  const canOpenStatisticsPlannerReport = canOpenAppointmentStatistics
    && hasOrgFeature("statistics.planner_report")
    && (!usesAdvancedMenuPermissions || canReadStatisticsPlannerReportPermission);
  const canOpenAppointmentSettings = hasOrgFeature("settings.appointments") && canReadSettingsAppointments;
  const canOpenAppointmentWorkSchedule = hasOrgFeature("appointments.work_schedule") && (
    usesAdvancedMenuPermissions
      ? canOpenWorkSchedulePermission
      : canOpenAppointmentSettings
  );
  const canOpenSettingsOrganizations = canReadSettingsOrganizations;
  const canOpenSettingsRoles = hasOrgFeature("settings.roles") && canReadSettingsRoles;
  const canOpenSettingsPositions = hasOrgFeature("settings.positions") && canReadSettingsPositions;
  const canOpenSettingsNorms = hasOrgFeature("settings.appointment_norms") && canReadSettingsAppointmentNorms;

  const hasAppointmentsMenuAccess = (
    canReadAppointments
    && (canOpenAppointmentSchedule || canOpenAppointmentBreaks || canOpenAppointmentVipClients)
  ) || canOpenAppointmentWorkSchedule;
  const hasUsersMenuAccess = canReadUsers || canCreateUsers;
  const hasSettingsMenuAccess = (
    canOpenAppointmentSettings
    || canOpenSettingsRoles
    || canOpenSettingsPositions
    || canOpenSettingsNorms
  );
  const hasAdminSettingsAccess = Boolean(profile?.isPlatformAdmin);

  const canAccessForcedView = useMemo(() => {
    if (Boolean(profile?.isPlatformAdmin)) {
      return true;
    }
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
    if (forcedView === "clients-medical-history") {
      return hasClientsMenuAccess && canReadClients && (canReadClientMedicalHistory || Boolean(profile?.isPlatformAdmin));
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
      return canOpenAppointmentSettings;
    }
    if (forcedView === "appointment-work-schedule") {
      return canOpenAppointmentWorkSchedule;
    }
    if (forcedView === "settings-organizations") {
      return canOpenSettingsOrganizations;
    }
    if (forcedView === "settings-monitoring") {
      return hasAdminSettingsAccess;
    }
    if (forcedView === "settings-roles") {
      return canOpenSettingsRoles;
    }
    if (forcedView === "settings-positions") {
      return canOpenSettingsPositions;
    }
    if (forcedView === "settings-appointment-norms") {
      return canOpenSettingsNorms;
    }
    if (forcedView === "notifications-send") {
      return canSendNotifications;
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
    canOpenAppointmentSettings,
    canOpenAppointmentWorkSchedule,
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
    canOpenSettingsOrganizations,
    canOpenSettingsNorms,
    canOpenSettingsPositions,
    canOpenSettingsRoles,
    canReadStatisticsClassAttendancePermission,
    canReadStatisticsPlannerReportPermission,
    hasClientsMenuAccess,
    canReadClientMedicalHistory,
    canReadUsers,
    canSendNotifications,
    forcedView,
    hasAdminSettingsAccess,
    hasSettingsMenuAccess,
    profile?.isPlatformAdmin
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
    canReadClientMedicalHistory,
    canCreateClientMedicalHistory,
    canUpdateClientMedicalHistory,
    canDeleteClientMedicalHistory,
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
    canOpenAppointmentSettings,
    canOpenAppointmentWorkSchedule,
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
    canReadSettingsAppointments,
    canUpdateSettingsAppointments,
    canReadSettingsAppointmentNorms,
    canCreateSettingsAppointmentNorms,
    canUpdateSettingsAppointmentNorms,
    canDeleteSettingsAppointmentNorms,
    canOpenSettingsNorms,
    canOpenSettingsOrganizations,
    canCreateSettingsOrganizations,
    canUpdateSettingsOrganizations,
    canDeleteSettingsOrganizations,
    canOpenSettingsRoles,
    canReadSettingsRoles,
    canCreateSettingsRoles,
    canUpdateSettingsRoles,
    canDeleteSettingsRoles,
    canOpenSettingsPositions,
    canReadSettingsPositions,
    canCreateSettingsPositions,
    canUpdateSettingsPositions,
    canDeleteSettingsPositions,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    canAccessForcedView
  };
}
