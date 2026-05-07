import { useMemo } from "react";
import { PERMISSIONS } from "../../constants/permissions.js";

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

  const hasPermissionCode = (permissionCode) => isPlatformAdmin || permissionSet.has(permissionCode);

  const canReadUsers = hasPermissionCode(PERMISSIONS.USERS_READ);
  const canCreateUsers = hasPermissionCode(PERMISSIONS.USERS_CREATE);
  const canUpdateUsers = hasPermissionCode(PERMISSIONS.USERS_UPDATE);
  const canDeleteUsers = hasPermissionCode(PERMISSIONS.USERS_DELETE);

  const canReadClients = hasPermissionCode(PERMISSIONS.CLIENTS_READ);
  const canCreateClients = hasPermissionCode(PERMISSIONS.CLIENTS_CREATE);
  const canUpdateClients = hasPermissionCode(PERMISSIONS.CLIENTS_UPDATE);
  const canDeleteClients = hasPermissionCode(PERMISSIONS.CLIENTS_DELETE);

  const canReadAppointments = hasPermissionCode(PERMISSIONS.APPOINTMENTS_PLANNER_READ);
  const canCreateAppointments = hasPermissionCode(PERMISSIONS.APPOINTMENTS_PLANNER_CREATE);
  const canUpdateAppointments = hasPermissionCode(PERMISSIONS.APPOINTMENTS_PLANNER_UPDATE);
  const canDeleteAppointments = hasPermissionCode(PERMISSIONS.APPOINTMENTS_PLANNER_DELETE);

  const canOpenPlannerPermission = hasPermissionCode(PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE);

  const canReadStatisticsPlannerReportPermission = hasPermissionCode(
    PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT
  );
  const canSearchAppointmentClientsPermission = hasPermissionCode(PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH);
  const canReadSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_READ);
  const canCreateSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_CREATE);
  const canUpdateSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_UPDATE);
  const canDeleteSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_DELETE);

  const canReadSettingsAppointmentsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_APPOINTMENTS_READ);
  const canUpdateSettingsAppointmentsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_APPOINTMENTS_UPDATE);
  const canReadSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_READ);
  const canCreateSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_CREATE);
  const canUpdateSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_UPDATE);
  const canDeleteSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_DELETE);
  const canReadSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_READ);
  const canCreateSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_CREATE);
  const canUpdateSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_UPDATE);
  const canDeleteSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_DELETE);

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

  const canOpenAppointmentSchedule = canReadAppointments && (
    usesAdvancedMenuPermissions ? (canOpenPlannerPermission || canReadAppointments) : true
  );
  const canReadAppointmentBreaks = canReadAppointments;
  const canCreateAppointmentBreaks = canCreateAppointments;
  const canUpdateAppointmentBreaks = canUpdateAppointments;
  const canDeleteAppointmentBreaks = canDeleteAppointments;
  const canOpenAppointmentBreaks = false;

  const canReadAppointmentSpecialistAbsences = canReadAppointments;
  const canCreateAppointmentSpecialistAbsences = false;
  const canDeleteAppointmentSpecialistAbsences = false;
  const canViewAppointmentSpecialistAbsenceBlocks = canReadAppointments;
  const canOpenAppointmentSpecialistAbsences = false;

  const canReadAppointmentWorkSchedule = canReadAppointments;
  const canCreateAppointmentWorkSchedule = canCreateAppointments;
  const canUpdateAppointmentWorkSchedule = canUpdateAppointments;
  const canDeleteAppointmentWorkSchedule = canDeleteAppointments;
  const canOpenAppointmentWorkSchedule = false;

  const canOpenAppointmentStatistics = canReadStatisticsPlannerReportPermission;
  const canReadDashboard = Boolean(profile?.username);
  const canOpenDashboard = canReadDashboard;
  const canOpenStatisticsPlannerReport = canOpenAppointmentStatistics;

  const canOpenSettingsOrganizations = isPlatformAdmin;
  const canCreateSettingsOrganizations = isPlatformAdmin;
  const canUpdateSettingsOrganizations = isPlatformAdmin;
  const canDeleteSettingsOrganizations = isPlatformAdmin;
  const canOpenSettingsRoles = canReadSettingsRoles;
  const canOpenSettingsPositions = canReadSettingsPositions;
  const canOpenAppointmentSettings = canReadSettingsAppointments;

  const hasAppointmentsMenuAccess = (
    canOpenAppointmentSchedule
  );
  const hasSettingsMenuAccess = (
    canOpenAppointmentSettings
    || canOpenSettingsRoles
    || canOpenSettingsPositions
  );
  const hasAdminSettingsAccess = isPlatformAdmin;
  const hasExplicitSiteContentPermissions = (
    canReadSiteContentPermission
    || canCreateSiteContentPermission
    || canUpdateSiteContentPermission
    || canDeleteSiteContentPermission
  );
  const canReadSiteContent = (
    hasExplicitSiteContentPermissions ? canReadSiteContentPermission : legacyHasSettingsAccess
  );
  const canCreateSiteContent = (
    hasExplicitSiteContentPermissions ? canCreateSiteContentPermission : legacyHasSettingsAccess
  );
  const canUpdateSiteContent = (
    hasExplicitSiteContentPermissions ? canUpdateSiteContentPermission : legacyHasSettingsAccess
  );
  const canDeleteSiteContent = (
    hasExplicitSiteContentPermissions ? canDeleteSiteContentPermission : legacyHasSettingsAccess
  );
  const canOpenSiteContent = Boolean(profile?.username) && canReadSiteContent;
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
    if (forcedView === "dashboard") {
      return canOpenDashboard;
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
    canOpenDashboard,
    canOpenSettingsOrganizations,
    canOpenSettingsPositions,
    canOpenSettingsRoles,
    canOpenStatisticsPlannerReport,
    canReadSiteContent,
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
    canOpenDashboard,
    canReadDashboard,
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
    canReadSiteContent,
    canCreateSiteContent,
    canUpdateSiteContent,
    canDeleteSiteContent,
    canAccessForcedView
  };
}
