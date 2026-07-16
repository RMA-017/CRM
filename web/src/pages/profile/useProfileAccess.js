import { useMemo } from "react";
import { PERMISSIONS } from "../../constants/permissions.js";

const SPECIALIST_ROLE_MATCHERS = Object.freeze([
  "specialist",
  "spetsialist",
  "mutaxassis",
  "специалист"
]);

function normalizeProfilePermissionCode(permission) {
  if (typeof permission === "string") {
    return permission.trim().toLowerCase();
  }
  if (!permission || typeof permission !== "object") {
    return "";
  }
  return String(permission.code || permission.value || permission.permissionCode || "")
    .trim()
    .toLowerCase();
}

export function useProfileAccess(profile, forcedView) {
  const isPlatformAdmin = Boolean(profile?.isPlatformAdmin);
  const profileRoleText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isSpecialistUser = SPECIALIST_ROLE_MATCHERS.some((matcher) => profileRoleText.includes(matcher));
  const permissionSet = useMemo(() => {
    if (!Array.isArray(profile?.permissions)) {
      return new Set();
    }
    return new Set(
      profile.permissions
        .map(normalizeProfilePermissionCode)
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

  const canReadStatisticsPlannerReportBasePermission = hasPermissionCode(
    PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT
  );
  const canReadStatisticsPlannerReportOnlyPermission = hasPermissionCode(
    PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT_ONLY
  );
  const canReadStatisticsPlannerReportAllPermission = hasPermissionCode(
    PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT_ALL
  );
  const canReadStatisticsPlannerReportPermission = (
    canReadStatisticsPlannerReportBasePermission
    || canReadStatisticsPlannerReportOnlyPermission
    || canReadStatisticsPlannerReportAllPermission
  );
  const canSearchAppointmentClientsPermission = hasPermissionCode(PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH);
  const canReadSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_READ);
  const canCreateSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_CREATE);
  const canUpdateSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_UPDATE);
  const canDeleteSiteContentPermission = hasPermissionCode(PERMISSIONS.WEBSITE_MANAGEMENT_DELETE);
  const canReadCrmLeadsPermission = hasPermissionCode(PERMISSIONS.CRM_LEADS_READ);
  const canUpdateCrmLeadsPermission = hasPermissionCode(PERMISSIONS.CRM_LEADS_UPDATE);
  const canReadServicesPermission = hasPermissionCode(PERMISSIONS.SERVICES_READ);
  const canReadFinanceCashierPermission = hasPermissionCode(PERMISSIONS.FINANCE_CASHIER_READ);
  const canCreateFinanceCashierPermission = hasPermissionCode(PERMISSIONS.FINANCE_CASHIER_CREATE);
  const canUpdateFinanceCashierPermission = hasPermissionCode(PERMISSIONS.FINANCE_CASHIER_UPDATE);
  const canPayFinanceCashierPermission = hasPermissionCode(PERMISSIONS.FINANCE_CASHIER_PAY);
  const canReadFinanceTicketsPermission = hasPermissionCode(PERMISSIONS.FINANCE_TICKETS_READ);
  const canReadFinanceTransactionsPermission = hasPermissionCode(PERMISSIONS.FINANCE_TRANSACTIONS_READ);
  const canReadFinanceBalancesPermission = hasPermissionCode(PERMISSIONS.FINANCE_BALANCES_READ);
  const canUpdateFinanceBalancesPermission = hasPermissionCode(PERMISSIONS.FINANCE_BALANCES_UPDATE);
  const canReadFinanceDailyCashPermission = hasPermissionCode(PERMISSIONS.FINANCE_DAILY_CASH_READ);
  const canReadFinanceReportsPermission = hasPermissionCode(PERMISSIONS.FINANCE_REPORTS_READ);

  const canReadSettingsAppointmentsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_APPOINTMENTS_READ);
  const canUpdateSettingsAppointmentsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_APPOINTMENTS_UPDATE);
  const canReadSettingsTelegramBotPermission = hasPermissionCode(PERMISSIONS.SETTINGS_TELEGRAM_BOT_READ);
  const canUpdateSettingsTelegramBotPermission = hasPermissionCode(PERMISSIONS.SETTINGS_TELEGRAM_BOT_UPDATE);
  const canReadSmsNotificationsPermission = hasPermissionCode(PERMISSIONS.SMS_NOTIFICATIONS_READ);
  const canSendSmsNotificationsPermission = hasPermissionCode(PERMISSIONS.SMS_NOTIFICATIONS_SEND);
  const canReadSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_READ);
  const canCreateSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_CREATE);
  const canUpdateSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_UPDATE);
  const canDeleteSettingsRolesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_ROLES_DELETE);
  const canReadSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_READ);
  const canCreateSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_CREATE);
  const canUpdateSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_UPDATE);
  const canDeleteSettingsPositionsPermission = hasPermissionCode(PERMISSIONS.SETTINGS_POSITIONS_DELETE);
  const canReadSettingsServicesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_SERVICES_READ);
  const canCreateSettingsServicesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_SERVICES_CREATE);
  const canUpdateSettingsServicesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_SERVICES_UPDATE);
  const canDeleteSettingsServicesPermission = hasPermissionCode(PERMISSIONS.SETTINGS_SERVICES_DELETE);
  const canReadSettingsFinancePermission = hasPermissionCode(PERMISSIONS.SETTINGS_FINANCE_READ);
  const canCreateSettingsFinancePermission = hasPermissionCode(PERMISSIONS.SETTINGS_FINANCE_CREATE);
  const canUpdateSettingsFinancePermission = hasPermissionCode(PERMISSIONS.SETTINGS_FINANCE_UPDATE);
  const canDeleteSettingsFinancePermission = hasPermissionCode(PERMISSIONS.SETTINGS_FINANCE_DELETE);

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
  const hasExplicitTelegramBotSettingsPermissions = (
    canReadSettingsTelegramBotPermission
    || canUpdateSettingsTelegramBotPermission
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
  const hasExplicitServiceSettingsPermissions = (
    canReadSettingsServicesPermission
    || canCreateSettingsServicesPermission
    || canUpdateSettingsServicesPermission
    || canDeleteSettingsServicesPermission
  );
  const hasExplicitFinanceSettingsPermissions = (
    canReadSettingsFinancePermission
    || canCreateSettingsFinancePermission
    || canUpdateSettingsFinancePermission
    || canDeleteSettingsFinancePermission
  );

  const canReadSettingsAppointments = hasExplicitAppointmentSettingsPermissions
    ? canReadSettingsAppointmentsPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsAppointments = hasExplicitAppointmentSettingsPermissions
    ? canUpdateSettingsAppointmentsPermission
    : legacyHasSettingsAccess;
  const canReadSettingsTelegramBot = hasExplicitTelegramBotSettingsPermissions
    ? canReadSettingsTelegramBotPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsTelegramBot = hasExplicitTelegramBotSettingsPermissions
    ? canUpdateSettingsTelegramBotPermission
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
  const canReadSettingsServices = hasExplicitServiceSettingsPermissions
    ? canReadSettingsServicesPermission
    : legacyHasSettingsAccess;
  const canCreateSettingsServices = hasExplicitServiceSettingsPermissions
    ? canCreateSettingsServicesPermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsServices = hasExplicitServiceSettingsPermissions
    ? canUpdateSettingsServicesPermission
    : legacyHasSettingsAccess;
  const canDeleteSettingsServices = hasExplicitServiceSettingsPermissions
    ? canDeleteSettingsServicesPermission
    : legacyHasSettingsAccess;
  const canReadSettingsFinance = hasExplicitFinanceSettingsPermissions
    ? canReadSettingsFinancePermission
    : legacyHasSettingsAccess;
  const canCreateSettingsFinance = hasExplicitFinanceSettingsPermissions
    ? canCreateSettingsFinancePermission
    : legacyHasSettingsAccess;
  const canUpdateSettingsFinance = hasExplicitFinanceSettingsPermissions
    ? canUpdateSettingsFinancePermission
    : legacyHasSettingsAccess;
  const canDeleteSettingsFinance = hasExplicitFinanceSettingsPermissions
    ? canDeleteSettingsFinancePermission
    : legacyHasSettingsAccess;

  const hasClientsMenuAccess = canReadClients;
  const canOpenCrm = canReadCrmLeadsPermission || canUpdateCrmLeadsPermission;
  const canUpdateCrm = canUpdateCrmLeadsPermission;
  const canOpenFinanceCashier = canReadFinanceCashierPermission;
  const canOpenFinanceTickets = canReadFinanceTicketsPermission;
  const canOpenFinanceTransactions = canReadFinanceTransactionsPermission;
  const canOpenFinanceBalances = canReadFinanceBalancesPermission;
  const canOpenFinanceDailyCash = canReadFinanceDailyCashPermission;
  const canOpenFinanceReports = canReadFinanceReportsPermission;
  const canOpenFinanceAudit = canReadFinanceReportsPermission;
  const canOpenFinance = (
    canOpenFinanceCashier
    || canOpenFinanceTickets
    || canOpenFinanceTransactions
    || canOpenFinanceBalances
    || canOpenFinanceDailyCash
    || canOpenFinanceReports
    || canOpenFinanceAudit
  );
  const canReadServices = canReadServicesPermission || canReadSettingsServices;
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

  const canReadDashboardReport = canReadStatisticsPlannerReportPermission || (isSpecialistUser && canReadAppointments);
  const canOpenAppointmentStatistics = canReadDashboardReport;
  const canOpenStatisticsPlannerReport = canOpenAppointmentStatistics;

  const canOpenSettingsOrganizations = isPlatformAdmin;
  const canCreateSettingsOrganizations = isPlatformAdmin;
  const canUpdateSettingsOrganizations = isPlatformAdmin;
  const canDeleteSettingsOrganizations = isPlatformAdmin;
  const canOpenSettingsRoles = canReadSettingsRoles;
  const canOpenSettingsPositions = canReadSettingsPositions;
  const canOpenSettingsServices = canReadSettingsServices;
  const canOpenSettingsFinance = canReadSettingsFinance;
  const canOpenServices = canReadServices;
  const canOpenAppointmentSettings = canReadSettingsAppointments;
  const canOpenTelegramBotSettings = canReadSettingsTelegramBot;
  const canOpenSmsNotifications = canReadSmsNotificationsPermission || canSendSmsNotificationsPermission;
  const canSendSmsNotifications = canSendSmsNotificationsPermission;

  const hasAppointmentsMenuAccess = (
    canOpenAppointmentSchedule
  );
  const hasSettingsMenuAccess = (
    canOpenAppointmentSettings
    || canOpenTelegramBotSettings
    || canOpenSettingsRoles
    || canOpenSettingsPositions
    || canOpenSettingsServices
    || canOpenSettingsFinance
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
    if (forcedView === "crm") {
      return canOpenCrm;
    }
    if (forcedView === "services") {
      return canOpenServices;
    }
    if (forcedView === "finance-cashier") {
      return canOpenFinanceCashier;
    }
    if (forcedView === "finance-tickets") {
      return canOpenFinanceTickets;
    }
    if (forcedView === "finance-transactions") {
      return canOpenFinanceTransactions;
    }
    if (forcedView === "finance-balances") {
      return canOpenFinanceBalances;
    }
    if (forcedView === "finance-daily-cash") {
      return canOpenFinanceDailyCash;
    }
    if (forcedView === "finance-reports") {
      return canOpenFinanceReports;
    }
    if (forcedView === "finance-audit") {
      return canOpenFinanceAudit;
    }
    if (forcedView === "appointment") {
      return canOpenAppointmentSchedule;
    }
    if (forcedView === "appointment-settings") {
      return canOpenAppointmentSettings;
    }
    if (forcedView === "telegram-bot-settings") {
      return canOpenTelegramBotSettings;
    }
    if (forcedView === "sms-notifications") {
      return canOpenSmsNotifications;
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
    if (forcedView === "settings-services") {
      return canOpenSettingsServices;
    }
    if (forcedView === "settings-finance") {
      return canOpenSettingsFinance;
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
    canOpenTelegramBotSettings,
    canOpenSmsNotifications,
    canOpenCrm,
    canOpenFinanceCashier,
    canOpenFinanceTickets,
    canOpenFinanceTransactions,
    canOpenFinanceBalances,
    canOpenFinanceDailyCash,
    canOpenFinanceReports,
    canOpenFinanceAudit,
    canOpenSettingsOrganizations,
    canOpenSettingsPositions,
    canOpenSettingsServices,
    canOpenSettingsFinance,
    canOpenServices,
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
    canOpenStatisticsPlannerReport,
    canReadStatisticsPlannerReportPermission,
    canReadDashboardReport,
    canReadSettingsAppointments,
    canUpdateSettingsAppointments,
    canOpenTelegramBotSettings,
    canUpdateSettingsTelegramBot,
    canOpenSmsNotifications,
    canSendSmsNotifications,
    canOpenCrm,
    canUpdateCrm,
    canOpenFinance,
    canOpenFinanceCashier,
    canOpenFinanceTickets,
    canOpenFinanceTransactions,
    canOpenFinanceBalances,
    canOpenFinanceDailyCash,
    canOpenFinanceReports,
    canOpenFinanceAudit,
    canCreateFinanceCashier: canCreateFinanceCashierPermission,
    canUpdateFinanceCashier: canUpdateFinanceCashierPermission,
    canPayFinanceCashier: canPayFinanceCashierPermission,
    canUpdateFinanceBalances: canUpdateFinanceBalancesPermission,
    canOpenFinanceReports,
    canReadFinanceReports: canReadFinanceReportsPermission,
    canReadServices,
    canOpenServices,
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
    canOpenSettingsServices,
    canReadSettingsServices,
    canCreateSettingsServices,
    canUpdateSettingsServices,
    canDeleteSettingsServices,
    canOpenSettingsFinance,
    canReadSettingsFinance,
    canCreateSettingsFinance,
    canUpdateSettingsFinance,
    canDeleteSettingsFinance,
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
