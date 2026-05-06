import { useMemo } from "react";
import { PERMISSIONS } from "../../constants/permissions.js";
import {
  hasAllowedFeature,
  isPermissionAllowedByFeatures
} from "../../../../shared/access-registry.js";

export function useProfileAccess(profile, forcedView) {
  const isPlatformAdmin = Boolean(profile?.isPlatformAdmin);
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

  const orgFeatureSet = useMemo(() => {
    if (isPlatformAdmin) {
      return null;
    }
    if (!Array.isArray(profile?.orgFeatures)) {
      return null;
    }
    return new Set(profile.orgFeatures);
  }, [isPlatformAdmin, profile?.orgFeatures]);

  const normalizedOrgFeatures = orgFeatureSet === null ? null : Array.from(orgFeatureSet);
  const hasOrgFeature = (feature) => hasAllowedFeature(normalizedOrgFeatures, feature);
  const hasPermissionWithOrgFeature = (permissionCode) => (
    isPlatformAdmin
    || (
      permissionSet.has(permissionCode)
      && isPermissionAllowedByFeatures(permissionCode, normalizedOrgFeatures)
    )
  );

  const canReadUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_READ);
  const canCreateUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_CREATE);
  const canUpdateUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_UPDATE);
  const canDeleteUsers = hasPermissionWithOrgFeature(PERMISSIONS.USERS_DELETE);

  const canReadClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_READ);
  const canCreateClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_CREATE);
  const canUpdateClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_UPDATE);
  const canDeleteClients = hasPermissionWithOrgFeature(PERMISSIONS.CLIENTS_DELETE);

  const canReadAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_PLANNER_READ);
  const canCreateAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_PLANNER_CREATE);
  const canUpdateAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_PLANNER_UPDATE);
  const canDeleteAppointments = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_PLANNER_DELETE);

  const canOpenPlannerPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE);

  const canReadStatisticsPlannerReportPermission = hasPermissionWithOrgFeature(
    PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT
  );
  const canSearchAppointmentClientsPermission = hasPermissionWithOrgFeature(PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH);

  const canReadSettingsAppointmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_APPOINTMENTS_READ);
  const canUpdateSettingsAppointmentsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_APPOINTMENTS_UPDATE);
  const canReadSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_READ);
  const canCreateSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_CREATE);
  const canUpdateSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_UPDATE);
  const canDeleteSettingsRolesPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_ROLES_DELETE);
  const canReadSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_READ);
  const canCreateSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_CREATE);
  const canUpdateSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_UPDATE);
  const canDeleteSettingsPositionsPermission = hasPermissionWithOrgFeature(PERMISSIONS.SETTINGS_POSITIONS_DELETE);

  const usesAdvancedMenuPermissions = (
    canOpenPlannerPermission
    || canReadAppointments
    || canCreateAppointments
    || canUpdateAppointments
    || canDeleteAppointments
    || canReadStatisticsPlannerReportPermission
  );

  const legacyHasSettingsAccess = Boolean(profile?.isAdmin || profile?.isPlatformAdmin);
  const hasExplicitAppointmentSettingsPermissions = (
    canReadSettingsAppointmentsPermission
    || canUpdateSettingsAppointmentsPermission
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

  const hasClientsMenuAccess = canReadClients;
  const hasUsersMenuAccess = canReadUsers || canCreateUsers;
  const hasAppointmentPlannerFeature = hasOrgFeature("appointments.planner");

  const canOpenAppointmentSchedule = canReadAppointments && hasAppointmentPlannerFeature && (
    usesAdvancedMenuPermissions ? (canOpenPlannerPermission || canReadAppointments) : true
  );
  const canReadAppointmentBreaks = canReadAppointments && hasAppointmentPlannerFeature;
  const canCreateAppointmentBreaks = canCreateAppointments && hasAppointmentPlannerFeature;
  const canUpdateAppointmentBreaks = canUpdateAppointments && hasAppointmentPlannerFeature;
  const canDeleteAppointmentBreaks = canDeleteAppointments && hasAppointmentPlannerFeature;
  const canOpenAppointmentBreaks = false;

  const canReadAppointmentSpecialistAbsences = canReadAppointments && hasAppointmentPlannerFeature;
  const canCreateAppointmentSpecialistAbsences = false;
  const canDeleteAppointmentSpecialistAbsences = false;
  const canViewAppointmentSpecialistAbsenceBlocks = canReadAppointments && hasAppointmentPlannerFeature;
  const canOpenAppointmentSpecialistAbsences = false;

  const canReadAppointmentWorkSchedule = canReadAppointments && hasAppointmentPlannerFeature;
  const canCreateAppointmentWorkSchedule = canCreateAppointments && hasAppointmentPlannerFeature;
  const canUpdateAppointmentWorkSchedule = canUpdateAppointments && hasAppointmentPlannerFeature;
  const canDeleteAppointmentWorkSchedule = canDeleteAppointments && hasAppointmentPlannerFeature;
  const canOpenAppointmentWorkSchedule = false;

  const canOpenAppointmentStatistics = (
    canReadStatisticsPlannerReportPermission
    && hasOrgFeature("statistics.planner_report")
  );
  const canOpenStatisticsPlannerReport = canOpenAppointmentStatistics;

  const canOpenSettingsOrganizations = isPlatformAdmin;
  const canCreateSettingsOrganizations = isPlatformAdmin;
  const canUpdateSettingsOrganizations = isPlatformAdmin;
  const canDeleteSettingsOrganizations = isPlatformAdmin;
  const canOpenSettingsRoles = hasOrgFeature("settings.roles") && canReadSettingsRoles;
  const canOpenSettingsPositions = hasOrgFeature("settings.positions") && canReadSettingsPositions;
  const canOpenAppointmentSettings = hasOrgFeature("settings.appointments") && canReadSettingsAppointments;

  const hasAppointmentsMenuAccess = (
    canOpenAppointmentSchedule
  );
  const hasSettingsMenuAccess = (
    canOpenAppointmentSettings
    || canOpenSettingsRoles
    || canOpenSettingsPositions
  );
  const hasAdminSettingsAccess = isPlatformAdmin;
  const canOpenSiteContent = Boolean(profile?.username) && (legacyHasSettingsAccess || isPlatformAdmin);
  const canSearchAppointmentClients = canSearchAppointmentClientsPermission || canReadClients;

  const canAccessForcedView = useMemo(() => {
    if (isPlatformAdmin) {
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
    if (forcedView === "appointment") {
      return canOpenAppointmentSchedule;
    }
    if (forcedView === "appointment-settings") {
      return canOpenAppointmentSettings;
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
    if (forcedView === "statistics" || forcedView === "statistics-planner-report") {
      return canOpenStatisticsPlannerReport;
    }
    if (forcedView === "site-content") {
      return canOpenSiteContent;
    }
    return false;
  }, [
    canCreateUsers,
    canOpenAppointmentSchedule,
    canOpenAppointmentSettings,
    canOpenSettingsOrganizations,
    canOpenSettingsPositions,
    canOpenSettingsRoles,
    canOpenStatisticsPlannerReport,
    canReadClients,
    canReadUsers,
    forcedView,
    hasAdminSettingsAccess,
    hasClientsMenuAccess,
    isPlatformAdmin,
    canOpenSiteContent
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
    canOpenAppointmentSchedule,
    canOpenAppointmentBreaks,
    canOpenAppointmentSpecialistAbsences,
    canOpenAppointmentSettings,
    canOpenAppointmentWorkSchedule,
    canReadAppointmentWorkSchedule,
    canCreateAppointmentWorkSchedule,
    canUpdateAppointmentWorkSchedule,
    canDeleteAppointmentWorkSchedule,
    canReadAppointmentBreaks,
    canReadAppointmentSpecialistAbsences,
    canCreateAppointmentSpecialistAbsences,
    canDeleteAppointmentSpecialistAbsences,
    canViewAppointmentSpecialistAbsenceBlocks,
    canCreateAppointmentBreaks,
    canUpdateAppointmentBreaks,
    canDeleteAppointmentBreaks,
    canOpenAppointmentStatistics,
    canOpenStatisticsPlannerReport,
    canReadSettingsAppointments,
    canUpdateSettingsAppointments,
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
    canOpenSiteContent,
    canAccessForcedView
  };
}
